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


async function deletePendingByGroupId(context, groupId) {
  await context.env.DB
    .prepare(`
      DELETE FROM registrations
      WHERE group_id = ?
        AND payment_status = 'PENDING_PAYMENT'
    `)
    .bind(groupId)
    .run();
}

async function rollbackReservedSlots(context, reservedSlots) {
  for (const item of reservedSlots || []) {
    await rollbackSlot(context, item.eventId, item.categoryId).catch(() => {});
  }
}

function normalizeParticipant(raw, fallbackAddress = "") {
  return {
    category_id: Number(raw.category_id || 0),
    full_name: cleanText(raw.full_name || raw.name),
    id_type: cleanText(raw.id_type || "ic").toLowerCase(),
    ic_passport: cleanText(raw.ic_passport || raw.ic),
    email: cleanText(raw.email),
    phone: cleanText(raw.phone),
    gender: cleanText(raw.gender),
    address: cleanText(raw.address || fallbackAddress),
    tee_size: cleanText(raw.tee_size || raw.event_tee_size),
    finisher_tee_size: cleanText(raw.finisher_tee_size),
    emergency_name: cleanText(raw.emergency_name),
    emergency_phone: cleanText(raw.emergency_phone)
  };
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
  let groupId = null;
  const reservedSlots = [];

  try {
    const body = await context.request.json();

    const eventId = Number(body.event_id || 0);
    const deliveryMethod = cleanText(body.delivery_method).toLowerCase() === "postage"
      ? "postage"
      : "pickup";

    const rawParticipants = Array.isArray(body.participants) && body.participants.length
      ? body.participants
      : [body];

    if (!eventId) {
      return json({
        success: false,
        error: "Invalid event."
      }, 400);
    }

    if (!rawParticipants.length) {
      return json({
        success: false,
        error: "At least one participant is required."
      }, 400);
    }

    const fallbackAddress = cleanText(body.address);
    const participants = rawParticipants.map(item => normalizeParticipant(item, fallbackAddress));

    if (participants.length > 10) {
      return json({
        success: false,
        error: "Maximum 10 participants per registration."
      }, 400);
    }

    const icSet = new Set();

    for (const participant of participants) {
      if (
        !participant.category_id ||
        !participant.full_name ||
        !participant.ic_passport ||
        !participant.email ||
        !participant.phone ||
        !participant.gender ||
        !participant.tee_size ||
        !participant.emergency_name ||
        !participant.emergency_phone
      ) {
        return json({
          success: false,
          error: "Please complete all required participant fields."
        }, 400);
      }

      if (!isValidEmail(participant.email)) {
        return json({
          success: false,
          error: "Please enter a valid email address."
        }, 400);
      }

      if (participant.id_type === "ic" && !/^\d{12}$/.test(participant.ic_passport)) {
        return json({
          success: false,
          error: "IC must be 12 digits."
        }, 400);
      }

      if (participant.id_type === "passport" && !/^[A-Z0-9]{1,9}$/i.test(participant.ic_passport)) {
        return json({
          success: false,
          error: "Passport must be maximum 9 characters."
        }, 400);
      }

      if (!/^\d+$/.test(participant.phone)) {
        return json({
          success: false,
          error: "Phone number must contain numbers only."
        }, 400);
      }

      if (!/^\d+$/.test(participant.emergency_phone)) {
        return json({
          success: false,
          error: "Emergency contact number must contain numbers only."
        }, 400);
      }

      const icKey = participant.ic_passport.toUpperCase();

      if (icSet.has(icKey)) {
        return json({
          success: false,
          error: "Duplicate IC / Passport found in participant list."
        }, 400);
      }

      icSet.add(icKey);
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

    const eventStatus = calculateEventStatus(event);

    if (eventStatus !== "OPEN") {
      return json({
        success: false,
        error: `Event is ${eventStatus}.`
      }, 400);
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

    if (deliveryMethod === "postage" && !fallbackAddress) {
      return json({
        success: false,
        error: "Address is required for postage."
      }, 400);
    }

    const preparedParticipants = [];
    let totalCategoryAmount = 0;

    for (const participant of participants) {
      const categoryRow = await context.env.DB
        .prepare(`
          SELECT *
          FROM event_categories
          WHERE id = ?
            AND event_id = ?
            AND is_active = 1
          LIMIT 1
        `)
        .bind(participant.category_id, event.id)
        .first();

      if (!categoryRow) {
        return json({
          success: false,
          error: "Category not available."
        }, 400);
      }

      const category = cleanText(categoryRow.name).toUpperCase();
      const requireFinisherTee = category.includes("21KM");

      if (requireFinisherTee && !participant.finisher_tee_size) {
        return json({
          success: false,
          error: `Please select Finisher Tee Size for ${participant.full_name}.`
        }, 400);
      }

      const priceRm = Number(categoryRow.price || 0);
      const categoryAmount = Math.round(priceRm * 100);

      if (!categoryAmount || categoryAmount <= 0) {
        return json({
          success: false,
          error: "Invalid category amount."
        }, 400);
      }

      totalCategoryAmount += categoryAmount;

      preparedParticipants.push({
        ...participant,
        categoryRow,
        category,
        categoryAmount
      });
    }

    for (const participant of preparedParticipants) {
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
            payment_status,
            payment_url,
            payment_ref
          FROM registrations
          WHERE event_slug = ?
            AND ic = ?
          LIMIT 1
        `)
        .bind(event.slug, participant.ic_passport)
        .first();

      if (existing) {
        const existingStatus = String(existing.payment_status || "").toUpperCase();

        if (existingStatus === "PAID") {
          return json({
            success: false,
            error: `${participant.ic_passport} is already registered and paid for this event.`,
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
          const recreate = body.recreate === true;
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
            .bind(event.slug, participant.ic_passport)
            .run();

          await rollbackExistingPendingSlot(context, event.id, existing.category);
        } else {
          return json({
            success: false,
            error: `${participant.ic_passport} already has a registration for this event. Please contact organizer.`,
            existing: {
              reg_no: existing.reg_no,
              payment_status: existing.payment_status
            }
          }, 409);
        }
      }
    }

    for (const participant of preparedParticipants) {
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
        await rollbackReservedSlots(context, reservedSlots);

        return json({
          success: false,
          error: "Event is full."
        }, 400);
      }

      const categorySlotUpdate = await context.env.DB
        .prepare(`
          UPDATE event_categories
          SET used_slots = used_slots + 1
          WHERE id = ?
            AND event_id = ?
            AND is_active = 1
            AND (slot_limit = 0 OR used_slots < slot_limit)
        `)
        .bind(participant.categoryRow.id, event.id)
        .run();

      if (!categorySlotUpdate.meta || categorySlotUpdate.meta.changes < 1) {
        await rollbackSlot(context, event.id, participant.categoryRow.id);
        await rollbackReservedSlots(context, reservedSlots);

        return json({
          success: false,
          error: `${participant.category} is full.`
        }, 400);
      }

      reservedSlots.push({
        eventId: event.id,
        categoryId: participant.categoryRow.id
      });
    }

    const prefix = event.slug || "RUN";
    groupId = makeRegNo(prefix);

    const postageAmount = Math.round(postageFeeRm * 100);
    const totalAmount = totalCategoryAmount + postageAmount;

    const primaryParticipant = preparedParticipants[0];
    const regNos = [];

    for (let i = 0; i < preparedParticipants.length; i++) {
      const participant = preparedParticipants[i];
      const regNo = i === 0 ? groupId : `${groupId}-${i + 1}`;
      regNos.push(regNo);

      const rowAmount = participant.categoryAmount + (i === 0 ? postageAmount : 0);
      const rowPostageFee = i === 0 ? postageFeeRm : 0;

      await context.env.DB
        .prepare(`
          INSERT INTO registrations (
            reg_no,
            group_id,
            participant_index,
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
            delivery_method,
            postage_fee,
            payment_status,
            payment_gateway,
            payment_ref,
            payment_url,

            created_at,
            paid_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
        `)
        .bind(
          regNo,
          groupId,
          i + 1,
          participant.full_name,
          participant.ic_passport,
          participant.email,
          participant.phone,
          participant.gender,
          participant.category,

          fallbackAddress,
          participant.tee_size,
          participant.finisher_tee_size,
          participant.emergency_name,
          participant.emergency_phone,

          event.slug,
          event.title,

          rowAmount,
          deliveryMethod,
          rowPostageFee,
          "PENDING_PAYMENT",
          "TOYYIBPAY",
          "",
          ""
        )
        .run();
    }

    const secretKey = context.env.TOYYIBPAY_SECRET_KEY;
    const categoryCode = context.env.TOYYIBPAY_CATEGORY_CODE;

    if (!secretKey || !categoryCode) {
      await deletePendingByGroupId(context, groupId);
      await rollbackReservedSlots(context, reservedSlots);

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

    const participantLabel = preparedParticipants.length > 1
      ? `${preparedParticipants.length} Participants`
      : primaryParticipant.category;

    const billName = limitText(event.title || "Runation", 30);
    const billDescription = limitText(
      `${event.title} ${participantLabel} Registration${postageAmount > 0 ? " + Postage" : ""}`,
      100
    );

    const billData = new URLSearchParams();
    billData.append("userSecretKey", secretKey);
    billData.append("categoryCode", categoryCode);
    billData.append("billName", billName);
    billData.append("billDescription", billDescription);
    billData.append("billPriceSetting", "1");
    billData.append("billPayorInfo", "1");
    billData.append("billAmount", String(totalAmount));
    billData.append("billReturnUrl", `${siteUrl}/success.html?ref=${encodeURIComponent(groupId)}`);
    billData.append("billCallbackUrl", `${siteUrl}/api/payment-callback`);
    billData.append("billExternalReferenceNo", groupId);
    billData.append("billTo", primaryParticipant.full_name);
    billData.append("billEmail", primaryParticipant.email);
    billData.append("billPhone", primaryParticipant.phone);
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
      await deletePendingByGroupId(context, groupId);
      await rollbackReservedSlots(context, reservedSlots);

      return json({
        success: false,
        error: "ToyyibPay returned invalid response.",
        detail: toyText
      }, 502);
    }

    const billCode = toyData?.[0]?.BillCode;

    if (!billCode) {
      await deletePendingByGroupId(context, groupId);
      await rollbackReservedSlots(context, reservedSlots);

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
        WHERE group_id = ?
      `)
      .bind(
        billCode,
        paymentUrl,
        groupId
      )
      .run();

    return json({
      success: true,
      message: "Registration saved. Redirecting to payment.",
      payment_url: paymentUrl,
      registration: {
        reg_no: groupId,
        group_id: groupId,
        reg_nos: regNos,
        participant_count: preparedParticipants.length,
        event_slug: event.slug,
        event_name: event.title,
        name: primaryParticipant.full_name,
        ic: primaryParticipant.ic_passport,
        email: primaryParticipant.email,
        phone: primaryParticipant.phone,
        gender: primaryParticipant.gender,
        address: fallbackAddress,
        delivery_method: deliveryMethod,
        postage_fee: postageFeeRm,
        category: participantLabel,
        amount: totalAmount,
        payment_status: "PENDING_PAYMENT",
        payment_ref: billCode
      }
    });

  } catch (err) {
    if (groupId) {
      await deletePendingByGroupId(context, groupId).catch(() => {});
    }

    await rollbackReservedSlots(context, reservedSlots).catch(() => {});

    return json({
      success: false,
      error: err.message
    }, 500);
  }
}