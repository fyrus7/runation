function json(data, status = 200) {
  return Response.json(data, { status });
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function cleanText(value) {
  return String(value || "").trim();
}

function getToyyibPayExpiryDateAfterOneHour() {
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(expiry);

  const get = type => parts.find(p => p.type === type)?.value || "00";

  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}


function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function makeRegNo(prefix) {
  const safePrefix = String(prefix || "RUN")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  return `${safePrefix}-${Date.now().toString(36).toUpperCase()}`;
}

function calculateEventStatus(event) {
  const now = new Date();

  if (event.status_mode === "force_open") return "OPEN";
  if (event.status_mode === "force_closed") return "CLOSED";

  if (event.open_at) {
    const openAt = new Date(event.open_at);
    if (now < openAt) return "UPCOMING";
  }

  if (event.close_at) {
    const closeAt = new Date(event.close_at);
    if (now > closeAt) return "CLOSED";
  }

  const totalLimit = Number(event.total_limit || 0);
  const usedSlots = Number(event.used_slots || 0);

  if (totalLimit > 0 && usedSlots >= totalLimit) return "FULL";

  return "OPEN";
}

async function deletePendingByRegNo(context, regNo) {
  await context.env.DB
    .prepare(`
      DELETE FROM registrations
      WHERE reg_no = ?
        AND payment_status = 'PENDING_PAYMENT'
    `)
    .bind(regNo)
    .run();
}

async function rollbackSlot(context, eventId, categoryId) {
  await context.env.DB
    .prepare(`
      UPDATE event_categories
      SET used_slots = CASE WHEN used_slots > 0 THEN used_slots - 1 ELSE 0 END
      WHERE id = ?
    `)
    .bind(categoryId)
    .run()
    .catch(() => {});

  await context.env.DB
    .prepare(`
      UPDATE events
      SET used_slots = CASE WHEN used_slots > 0 THEN used_slots - 1 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(eventId)
    .run()
    .catch(() => {});
}

async function rollbackExistingPendingSlot(context, eventId, categoryName) {
  await context.env.DB
    .prepare(`
      UPDATE event_categories
      SET used_slots = CASE WHEN used_slots > 0 THEN used_slots - 1 ELSE 0 END
      WHERE event_id = ?
        AND UPPER(name) = UPPER(?)
    `)
    .bind(eventId, categoryName)
    .run()
    .catch(() => {});

  await context.env.DB
    .prepare(`
      UPDATE events
      SET used_slots = CASE WHEN used_slots > 0 THEN used_slots - 1 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(eventId)
    .run()
    .catch(() => {});
}

export async function onRequestPost(context) {
  let insertedRegNo = null;
  let reservedEventId = null;
  let reservedCategoryId = null;

  try {
    const body = await context.request.json();

    const eventId = Number(body.event_id || 0);
    const categoryId = Number(body.category_id || 0);

    const name = cleanText(body.full_name || body.name);
    const ic = cleanText(body.ic_passport || body.ic);
    const email = cleanText(body.email);
    const phone = cleanText(body.phone);
    const gender = cleanText(body.gender);
    const address = cleanText(body.address);
	const deliveryMethod = cleanText(body.delivery_method).toLowerCase() === "postage"
	  ? "postage"
	  : "pickup";
	  
	const eventTeeSize = cleanText(body.tee_size || body.event_tee_size);
    const emergencyName = cleanText(body.emergency_name);
    const emergencyPhone = cleanText(body.emergency_phone);

    const recreate = body.recreate === true;

    if (!eventId || !categoryId) {
      return json({
        success: false,
        error: "Invalid event or category."
      }, 400);
    }

    if (!name || !ic || !email || !phone || !gender || !eventTeeSize || !emergencyName || !emergencyPhone) {
	  return json({
		success: false,
		error: "Please complete all required fields."
	  }, 400);
	}
	
	if (!isValidEmail(email)) {
	  return json({
		success: false,
		error: "Please enter a valid email address."
	  }, 400);
	}

    const event = await context.env.DB
      .prepare(`
        SELECT *
        FROM events
        WHERE id = ?
        LIMIT 1
      `)
      .bind(eventId)
      .first();

    if (!event) {
      return json({
        success: false,
        error: "Event not found."
      }, 404);
    }
	
	const postageEnabled = Number(event.postage_enabled || 0) === 1;
	const postageFeeRm = postageEnabled && deliveryMethod === "postage"
      ? Number(event.postage_fee || 0)
	  : 0;
	  
	if (deliveryMethod === "postage" && !postageEnabled) {
	  return json({
		success: false,
		error: "Postage is not available for this event."
	  }, 400);
	}
	
	if (deliveryMethod === "postage" && !address) {
	  return json({
		success: false,
		error: "Address is required for postage."
	  }, 400);
	}

    const eventStatus = calculateEventStatus(event);

    if (eventStatus !== "OPEN") {
      return json({
        success: false,
        error: `Event is ${eventStatus}.`
      }, 400);
    }

    const categoryRow = await context.env.DB
      .prepare(`
        SELECT *
        FROM event_categories
        WHERE id = ?
          AND event_id = ?
          AND is_active = 1
        LIMIT 1
      `)
      .bind(categoryId, eventId)
      .first();

    if (!categoryRow) {
      return json({
        success: false,
        error: "Category not available."
      }, 400);
    }

    const category = cleanText(categoryRow.name).toUpperCase();

    const requireFinisherTee = category.includes("21KM");
    const finisherTeeSize = requireFinisherTee
      ? cleanText(body.finisher_tee_size)
      : "";

    if (requireFinisherTee && !finisherTeeSize) {
      return json({
        success: false,
        error: "Please select Finisher Tee Size."
      }, 400);
    }

    /*
      event_categories.price = RM.
      Contoh:
      65.00 → RM65.00
      75.00 → RM75.00
      ToyyibPay perlukan amount dalam sen.
    */
    const priceRm = Number(categoryRow.price || 0);
	const categoryAmount = Math.round(priceRm * 100);
	const postageAmount = Math.round(postageFeeRm * 100);
	const amount = categoryAmount + postageAmount;
	
	if (!categoryAmount || categoryAmount <= 0) {
	  return json({
		success: false,
		error: "Invalid category amount."
	  }, 400);
	}

    const existing = await context.env.DB
      .prepare(`
        SELECT
          id,
          reg_no,
          event_slug,
          event_name,
          name,
          ic,
          category,
          amount,
		  delivery_method,
		  postage_fee,
          payment_status,
		  payment_gateway,
          payment_ref,
		  payment_url
        FROM registrations
        WHERE event_slug = ?
          AND ic = ?
        LIMIT 1
      `)
      .bind(event.slug, ic)
      .first();

    if (existing) {
      const existingStatus = String(existing.payment_status || "").toUpperCase();

      if (existingStatus === "PAID") {
        return json({
          success: false,
          error: "This IC / Passport is already registered and paid for this event.",
          existing: {
            reg_no: existing.reg_no,
            event_name: existing.event_name,
            name: existing.name,
            category: existing.category,
            payment_status: existing.payment_status
          }
        }, 409);
      }

      if (existingStatus === "PENDING_PAYMENT") {
        const hasPaymentLink = existing.payment_url && existing.payment_ref;

        if (!recreate && hasPaymentLink) {
          return json({
            success: true,
            duplicate_pending: true,
            message: "Pending registration found.",
            payment_url: existing.payment_url,
            registration: {
              reg_no: existing.reg_no,
              event_slug: existing.event_slug,
              event_name: existing.event_name,
              name: existing.name,
              ic: existing.ic,
              category: existing.category,
              amount: existing.amount,
              payment_status: existing.payment_status,
              payment_ref: existing.payment_ref
            }
          });
        }

        await context.env.DB
          .prepare(`
            DELETE FROM registrations
            WHERE event_slug = ?
              AND ic = ?
              AND payment_status = 'PENDING_PAYMENT'
          `)
          .bind(event.slug, ic)
          .run();

        await rollbackExistingPendingSlot(context, event.id, existing.category);
      } else {
        return json({
          success: false,
          error: "This IC / Passport already has a registration for this event. Please contact organizer.",
          existing: {
            reg_no: existing.reg_no,
            payment_status: existing.payment_status
          }
        }, 409);
      }
    }

    const eventSlotUpdate = await context.env.DB
      .prepare(`
        UPDATE events
        SET used_slots = used_slots + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND (total_limit = 0 OR used_slots < total_limit)
      `)
      .bind(event.id)
      .run();

    if (!eventSlotUpdate.meta || eventSlotUpdate.meta.changes < 1) {
      return json({
        success: false,
        error: "Event is full."
      }, 400);
    }

    reservedEventId = event.id;

    const categorySlotUpdate = await context.env.DB
      .prepare(`
        UPDATE event_categories
        SET used_slots = used_slots + 1
        WHERE id = ?
          AND event_id = ?
          AND is_active = 1
          AND (slot_limit = 0 OR used_slots < slot_limit)
      `)
      .bind(categoryRow.id, event.id)
      .run();

    if (!categorySlotUpdate.meta || categorySlotUpdate.meta.changes < 1) {
      await rollbackSlot(context, event.id, categoryRow.id);

      return json({
        success: false,
        error: "Category is full."
      }, 400);
    }

    reservedCategoryId = categoryRow.id;

    const prefix = event.slug || "RUN";
    const regNo = makeRegNo(prefix);
    insertedRegNo = regNo;

    await context.env.DB
      .prepare(`
        INSERT INTO registrations (
          reg_no,
          name,
          ic,
          email,
          phone,
          gender,
          category,

          address,
          event_tee_size,
          finisher_tee_size,
          emergency_name,
          emergency_phone,

          event_slug,
          event_name,

          amount,
          payment_status,
          payment_gateway,
          payment_ref,
          payment_url,

          created_at,
          paid_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      `)
      .bind(
        regNo,
        name,
        ic,
        email,
        phone,
        gender,
        category,

        address,
        eventTeeSize,
        finisherTeeSize,
        emergencyName,
        emergencyPhone,

        event.slug,
        event.title,

        amount,
		deliveryMethod,
		postageFeeRm,
        "PENDING_PAYMENT",
        "TOYYIBPAY",
        "",
        ""
      )
      .run();

    const secretKey = context.env.TOYYIBPAY_SECRET_KEY;
    const categoryCode = context.env.TOYYIBPAY_CATEGORY_CODE;

    if (!secretKey || !categoryCode) {
      await deletePendingByRegNo(context, regNo);
      await rollbackSlot(context, event.id, categoryRow.id);

      return json({
        success: false,
        error: "ToyyibPay environment variables are not set."
      }, 500);
    }

    const siteUrl = context.env.SITE_URL || new URL(context.request.url).origin;
	
	const toyyibpayBase =
      context.env.TOYYIBPAY_MODE === "sandbox"
        ? "https://dev.toyyibpay.com"
        : "https://toyyibpay.com";

    const billName = limitText(event.title || "Runation", 30);
    const billDescription = limitText(
	  `${event.title} ${category} Registration${postageAmount > 0 ? " + Postage" : ""}`,
	  100
	);

    const billData = new URLSearchParams();
    billData.append("userSecretKey", secretKey);
    billData.append("categoryCode", categoryCode);
    billData.append("billName", billName);
    billData.append("billDescription", billDescription);
    billData.append("billPriceSetting", "1");
    billData.append("billPayorInfo", "1");
    billData.append("billAmount", String(amount));
    billData.append("billReturnUrl", `${siteUrl}/success.html?ref=${encodeURIComponent(regNo)}`);
    billData.append("billCallbackUrl", `${siteUrl}/api/payment-callback`);
    billData.append("billExternalReferenceNo", regNo);
    billData.append("billTo", name);
    billData.append("billEmail", email);
    billData.append("billPhone", phone);
    billData.append("billSplitPayment", "0");
    billData.append("billSplitPaymentArgs", "");
    billData.append("billPaymentChannel", "0");
	billData.append("billExpiryDate", getToyyibPayExpiryDateAfterOneHour());

    const toyRes = await fetch(`${toyyibpayBase}/index.php/api/createBill`, {
      method: "POST",
      body: billData
    });

    const toyText = await toyRes.text();

    let toyData;
    try {
      toyData = JSON.parse(toyText);
    } catch (e) {
      await deletePendingByRegNo(context, regNo);
      await rollbackSlot(context, event.id, categoryRow.id);

      return json({
        success: false,
        error: "ToyyibPay returned invalid response.",
        detail: toyText
      }, 502);
    }

    const billCode = toyData?.[0]?.BillCode;

    if (!billCode) {
      await deletePendingByRegNo(context, regNo);
      await rollbackSlot(context, event.id, categoryRow.id);

      return json({
        success: false,
        error: "ToyyibPay bill creation failed.",
        detail: toyText
      }, 502);
    }

    const paymentUrl = `${toyyibpayBase}/${billCode}`;

    await context.env.DB
      .prepare(`
        UPDATE registrations
        SET
          payment_ref = ?,
          payment_url = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE reg_no = ?
      `)
      .bind(
        billCode,
        paymentUrl,
        regNo
      )
      .run();

    return json({
      success: true,
      message: "Registration saved. Redirecting to payment.",
      payment_url: paymentUrl,
      registration: {
        reg_no: regNo,
        event_slug: event.slug,
        event_name: event.title,
        name,
        ic,
        email,
        phone,
        gender,
        address,
		delivery_method: deliveryMethod,
		postage_fee: postageFeeRm,
        category,
        event_tee_size: eventTeeSize,
        finisher_tee_size: finisherTeeSize,
        emergency_name: emergencyName,
        emergency_phone: emergencyPhone,
        amount,
        payment_status: "PENDING_PAYMENT",
        payment_ref: billCode
      }
    });

  } catch (err) {
    if (insertedRegNo) {
      await deletePendingByRegNo(context, insertedRegNo).catch(() => {});
    }

    if (reservedEventId && reservedCategoryId) {
      await rollbackSlot(context, reservedEventId, reservedCategoryId).catch(() => {});
    }

    return json({
      success: false,
      error: err.message
    }, 500);
  }
}