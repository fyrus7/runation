export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare("SELECT 1 AS ok")
      .first();

    return Response.json({
      success: true,
      message: "D1 connected",
      result
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}