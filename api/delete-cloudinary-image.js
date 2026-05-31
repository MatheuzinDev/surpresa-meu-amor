const crypto = require("crypto");

const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const authorizedEmails = (process.env.AUTHORIZED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function getRequestBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (request.body && typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function getUserFromToken(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ idToken })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.users?.length) {
    throw new Error("Acesso inválido.");
  }

  return data.users[0];
}

function signCloudinaryRequest(publicId, timestamp) {
  return crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`)
    .digest("hex");
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Método não permitido." });
  }

  if (!firebaseApiKey || !cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret || !authorizedEmails.length) {
    return sendJson(response, 500, { error: "Configuração do servidor incompleta." });
  }

  try {
    const authorization = request.headers.authorization || "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (!idToken) {
      return sendJson(response, 401, { error: "Acesso não autorizado." });
    }

    const user = await getUserFromToken(idToken);
    const userEmail = String(user.email || "").toLowerCase();

    if (!authorizedEmails.includes(userEmail)) {
      return sendJson(response, 403, { error: "E-mail sem permissão." });
    }

    const { publicId } = await getRequestBody(request);

    if (!publicId || typeof publicId !== "string" || publicId.length > 180) {
      return sendJson(response, 400, { error: "Imagem inválida." });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signCloudinaryRequest(publicId, timestamp);
    const formData = new URLSearchParams({
      public_id: publicId,
      timestamp,
      api_key: cloudinaryApiKey,
      signature
    });

    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/destroy`, {
      method: "POST",
      body: formData
    });
    const cloudinaryResult = await cloudinaryResponse.json().catch(() => ({}));

    if (!cloudinaryResponse.ok || !["ok", "not found"].includes(cloudinaryResult.result)) {
      return sendJson(response, 502, { error: cloudinaryResult.error?.message || "Não foi possível apagar a imagem." });
    }

    return sendJson(response, 200, { success: true, result: cloudinaryResult.result });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Erro inesperado." });
  }
};
