import { json } from "../../server/lib/response.js";

function malaysiaNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanPromoCode(value) {
  return String(value || "").trim().toUpperCase();
}

function rmToSen(value) {
  return Math.round(Number(value || 0) * 100);
}

function sen(value) {
  return Math.round(Number(value || 0));
}

async function validatePromoCode(context, event, promoCode, subtotalAmount, extraFeeAmount = 0) {
  const code = cleanPromoCode(promoCode);

  if (!code) {
    return {
      promoId: null,
      code: "",
      discountAmount: 0,
      finalAmount: subtotalAmount
    };
  }

  const promo = await context.env.DB
    .prepare(`
      SELECT
        id,
        code,
        discount_amount,
        usage_limit,
        used_count,
        is_active
      FROM event_promo_codes
      WHERE event_id = ?
        AND UPPER(code) = ?
      LIMIT 1
    `)
    .bind(event.id, code)
    .first();

  if (!promo || Number(promo.is_active || 0) !== 1) {
    throw new Error("Invalid promo code.");
  }

  const usageLimit = Number(promo.usage_limit || 0);
  const usedCount = Number(promo.used_count || 0);

  if (usageLimit > 0 && usedCount >= usageLimit) {
    throw new Error("Promo code limit reached.");
  }

  const discountAmount = Math.min(
    rmToSen(promo.discount_amount),
    subtotalAmount
  );

  const finalAmount = Math.max(subtotalAmount - discountAmount, 0);

  if (finalAmount + sen(extraFeeAmount) < 100) {
    throw new Error("Total after discount must be at least RM1.00.");
  }

  return {
    promoId: promo.id,
    code: promo.code,
    discountAmount,
    finalAmount
  };
}

async function reservePromoCode(context, promoId) {
  if (!promoId) return;

  const now = malaysiaNow();

  const result = await context.env.DB
    .prepare(`
      UPDATE event_promo_codes
      SET
        used_count = used_count + 1,
        updated_at = ?
      WHERE id = ?
        AND is_active = 1
        AND (usage_limit = 0 OR used_count < usage_limit)
    `)
    .bind(now, promoId)
    .run();

  if (!result.meta || result.meta.changes < 1) {
    throw new Error("Promo code limit reached.");
  }
}

async function releasePromoCode(context, promoId) {
  if (!promoId) return;

  const now = malaysiaNow();

  await context.env.DB
    .prepare(`
      UPDATE event_promo_codes
      SET
        used_count = CASE
          WHEN used_count > 0 THEN used_count - 1
          ELSE 0
        END,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(now, promoId)
    .run()
    .catch(() => {});
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

function parseRunationDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let text = raw.replace(" ", "T");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    text = `${text}T00:00:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    text = `${text}:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    text = `${text}+08:00`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventDateEnd(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const date = new Date(`${dateOnly}T23:59:59+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateEventStatus(event) {
  const now = new Date();

  const statusMode = String(event.status_mode || "").trim();
  const openAt = parseRunationDateTime(event.open_at);
  const closeAt = parseRunationDateTime(event.close_at);
  const eventDateEnd = getEventDateEnd(event.event_date);

  if (statusMode === "force_closed") {
    return "CLOSED";
  }

  if (openAt && now < openAt) {
    return "UPCOMING";
  }

  if (closeAt && now > closeAt) {
    return "CLOSED";
  }

  if (eventDateEnd && now > eventDateEnd) {
    return "CLOSED";
  }

  if (statusMode === "force_open") {
    return "OPEN";
  }

  return "CLOSED";
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
        AND payment_status IN ('PENDING_PAYMENT', 'OFFLINE_PENDING')
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
  const now = malaysiaNow();

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
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, eventId)
    .run()
    .catch(() => {});
}

async function rollbackExistingPendingSlot(context, eventId, categoryName) {
  const now = malaysiaNow();

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
          updated_at = ?
      WHERE id = ?
    `)
    .bind(now, eventId)
    .run()
    .catch(() => {});
}


function getPaymentMode(event) {
  const manualMode = String(event.payment_mode || "online").toLowerCase();
  const approvalStatus = String(event.approval_status || "live").toLowerCase();

  if (manualMode === "offline") {
    return "offline";
  }

  if (approvalStatus === "sandbox") {
    return "toyyibpay_sandbox";
  }

  return "toyyibpay_live";
}

function getToyyibPayConfig(env, paymentMode) {
  if (paymentMode === "toyyibpay_sandbox") {
    return {
      baseUrl: env.TOYYIBPAY_SANDBOX_BASE_URL || "https://dev.toyyibpay.com",
      secretKey: env.TOYYIBPAY_SANDBOX_SECRET_KEY,
      categoryCode: env.TOYYIBPAY_SANDBOX_CATEGORY_CODE,
      gateway: "TOYYIBPAY_SANDBOX",
      isTest: 1
    };
  }

  return {
    baseUrl: env.TOYYIBPAY_LIVE_BASE_URL || env.TOYYIBPAY_BASE_URL || "https://toyyibpay.com",
    secretKey: env.TOYYIBPAY_LIVE_SECRET_KEY || env.TOYYIBPAY_SECRET_KEY,
    categoryCode: env.TOYYIBPAY_LIVE_CATEGORY_CODE || env.TOYYIBPAY_CATEGORY_CODE,
    gateway: "TOYYIBPAY",
    isTest: 0
  };
}


export async function onRequestPost(context) {
  let groupId = null;
  let reservedPromoId = null;
  const reservedSlots = [];

  try {
    const body = await context.request.json();
const now = malaysiaNow();

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
        !participant.phone ||
        !participant.gender ||
        !participant.emergency_name ||
        !participant.emergency_phone
      ) {
        return json({
          success: false,
          error: "Please complete all required participant fields."
        }, 400);
      }

      if (participant.email && !isValidEmail(participant.email)) {
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
	
	const paymentMode = getPaymentMode(event);
const isOfflinePayment = paymentMode === "offline";

if (!isOfflinePayment) {
  for (const participant of participants) {
    if (!participant.email) {
      return json({
        success: false,
        error: "Email is required for online payment."
      }, 400);
    }
  }
}
	
const eventTeeEnabled = Number(event.event_tee_enabled ?? 1) === 1;
const finisherTeeEnabled = Number(event.finisher_tee_enabled ?? 0) === 1;

for (const participant of participants) {
  if (eventTeeEnabled && !String(participant.tee_size || "").trim()) {
    return json({
      success: false,
      error: "T-shirt size is required."
    }, 400);
  }

  if (finisherTeeEnabled && !String(participant.finisher_tee_size || "").trim()) {
    return json({
      success: false,
      error: "Finisher tee size is required."
    }, 400);
  }
}

    const isSandboxRegistration =
  String(event.approval_status || "live").toLowerCase() === "sandbox";

const eventStatus = calculateEventStatus(event);

if (!isSandboxRegistration && eventStatus !== "OPEN") {
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

      if (finisherTeeEnabled && !participant.finisher_tee_size) {
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

if (!isSandboxRegistration) {
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

      if (existingStatus === "PENDING_PAYMENT" || existingStatus === "OFFLINE_PENDING") {
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
              AND payment_status IN ('PENDING_PAYMENT', 'OFFLINE_PENDING')
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
}

if (!isSandboxRegistration) {
  for (const participant of preparedParticipants) {
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
      await rollbackReservedSlots(context, reservedSlots);

      return json({
        success: false,
        error: `${participant.category} is full.`
      }, 400);
    }

    await context.env.DB
  .prepare(`
    UPDATE events
    SET used_slots = used_slots + 1,
        updated_at = ?
    WHERE id = ?
  `)
  .bind(now, event.id)
  .run();

    reservedSlots.push({
      eventId: event.id,
      categoryId: participant.categoryRow.id
    });
  }
}

    const prefix = event.slug || "RUN";
    groupId = makeRegNo(prefix);

const postageAmount = Math.round(postageFeeRm * 100);

const adminFeeEnabled = Number(event.admin_fee_enabled || 0) === 1;
const rawAdminFeeRm = adminFeeEnabled
  ? Number(event.admin_fee_amount ?? 3)
  : 0;

const adminFeeRm =
  Number.isFinite(rawAdminFeeRm) && rawAdminFeeRm > 0
    ? rawAdminFeeRm
    : 0;

const adminFeeAmount = rmToSen(adminFeeRm);

const subtotalAmount = totalCategoryAmount + postageAmount;
const originalTotalAmount = subtotalAmount + adminFeeAmount;

const promo = await validatePromoCode(
  context,
  event,
  body.promo_code,
  subtotalAmount,
  adminFeeAmount
);

await reservePromoCode(context, promo.promoId);
reservedPromoId = promo.promoId;

const finalAmount = promo.finalAmount + adminFeeAmount;
const promoDiscountAmount = promo.discountAmount;

    const primaryParticipant = preparedParticipants[0];

const participantLabel = preparedParticipants.length > 1
  ? `${preparedParticipants.length} Participants`
  : primaryParticipant.category;


let toyyib = null;
let paymentGateway = "OFFLINE";
let paymentIsTest = 0;
let initialPaymentStatus = "OFFLINE_PENDING";
let initialPaymentRef = `OFFLINE-${groupId}`;
let initialPaymentUrl = "";

if (!isOfflinePayment) {
  toyyib = getToyyibPayConfig(context.env, paymentMode);

  if (!toyyib.secretKey || !toyyib.categoryCode) {
    await rollbackReservedSlots(context, reservedSlots);
    await releasePromoCode(context, reservedPromoId);
    reservedPromoId = null;

    return json({
      success: false,
      error: `ToyyibPay config missing for ${paymentMode}.`
    }, 500);
  }

  paymentGateway = toyyib.gateway;
  paymentIsTest = toyyib.isTest;
  initialPaymentStatus = "PENDING_PAYMENT";
  initialPaymentRef = "";
  initialPaymentUrl = "";
}

const regNos = [];

let remainingPromoDiscount = promoDiscountAmount;

for (let i = 0; i < preparedParticipants.length; i++) {
  const participant = preparedParticipants[i];
  const regNo = i === 0 ? groupId : `${groupId}-${i + 1}`;
  regNos.push(regNo);

const rowDiscountableAmount = participant.categoryAmount + (i === 0 ? postageAmount : 0);
const rowAdminFeeAmount = i === 0 ? adminFeeAmount : 0;
const originalRowAmount = rowDiscountableAmount + rowAdminFeeAmount;

const rowPromoDiscount = Math.min(remainingPromoDiscount, rowDiscountableAmount);
const rowAmount = sen(originalRowAmount - rowPromoDiscount);

remainingPromoDiscount = sen(remainingPromoDiscount - rowPromoDiscount);

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
			original_amount,
			promo_code,
			promo_discount,
            delivery_method,
            postage_fee,
            payment_status,
            payment_gateway,
            payment_ref,
            payment_url,
			is_test,

            created_at,
            paid_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
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
		  originalRowAmount,
		  promo.code,
		  rowPromoDiscount,
          deliveryMethod,
          rowPostageFee,
          initialPaymentStatus,
		  paymentGateway,
		  initialPaymentRef,
		  initialPaymentUrl,
		  paymentIsTest,
		  now,
		  now
        )
        .run();
    }

if (isOfflinePayment) {
  return json({
    success: true,
    offline_payment: true,
    message: "Registration saved. Please complete payment with organizer.",
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
      amount: finalAmount,
      original_amount: originalTotalAmount,
      promo_code: promo.code,
      promo_discount: promoDiscountAmount,
      payment_status: "OFFLINE_PENDING",
      payment_gateway: "OFFLINE",
      payment_ref: initialPaymentRef,
      payment_url: "",
      is_test: 0
    }
  });
}

const siteUrl = context.env.SITE_URL || new URL(context.request.url).origin;
const toyyibpayBase = toyyib.baseUrl;


    const billName = limitText(event.title || "Runation", 30);
    const billDescription = limitText(
      `${event.title} ${participantLabel} Registration${postageAmount > 0 ? " + Postage" : ""}${adminFeeAmount > 0 ? " + Admin Fee" : ""}`,
      100
    );

    const billData = new URLSearchParams();
    billData.append("userSecretKey", toyyib.secretKey);
	billData.append("categoryCode", toyyib.categoryCode);
    billData.append("billName", billName);
    billData.append("billDescription", billDescription);
    billData.append("billPriceSetting", "1");
    billData.append("billPayorInfo", "1");
    billData.append("billAmount", String(finalAmount));
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
	  await releasePromoCode(context, reservedPromoId);
	  reservedPromoId = null;

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
	  await releasePromoCode(context, reservedPromoId);
	  reservedPromoId = null;

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
      updated_at = ?
    WHERE group_id = ?
  `)
  .bind(
    billCode,
    paymentUrl,
    now,
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
		admin_fee: adminFeeRm,
        category: participantLabel,
        amount: finalAmount,
		original_amount: originalTotalAmount,
		promo_code: promo.code,
		promo_discount: promoDiscountAmount,
        payment_status: "PENDING_PAYMENT",
		payment_gateway: toyyib.gateway,
		payment_ref: billCode,
		is_test: toyyib.isTest
      }
    });

  } catch (err) {
    if (groupId) {
      await deletePendingByGroupId(context, groupId).catch(() => {});
    }

    await rollbackReservedSlots(context, reservedSlots).catch(() => {});
	await releasePromoCode(context, reservedPromoId).catch(() => {});

    return json({
      success: false,
      error: err.message
    }, 500);
  }
}