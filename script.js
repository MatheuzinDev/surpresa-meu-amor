import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCuUswsjSwLPvRU5gDrrtR13AZWKV3n3mg",
  authDomain: "matheus-cecilia.firebaseapp.com",
  projectId: "matheus-cecilia",
  storageBucket: "matheus-cecilia.firebasestorage.app",
  messagingSenderId: "220258699171",
  appId: "1:220258699171:web:72543f2e005e80e11e7c16",
  measurementId: "G-82SXZNDELR"
};

const cloudinaryConfig = {
  cloudName: "dbo148dn3",
  uploadPreset: "meu_amor_momentos"
};

const relationshipStart = new Date("2026-02-16T00:00:00-03:00");
const baseMoments = [
  {
    id: "ficamos",
    date: "2025-12-31",
    title: "Quando começamos a ficar",
    description: "No último dia de 2025, começou uma parte linda da nossa história. Um começo leve, especial e cheio daquele sentimento bom de querer estar perto.",
    imageUrl: ""
  },
  {
    id: "namoro",
    date: "2026-02-16",
    title: "O início do nosso namoro",
    description: "No dia 16/02/2026, nossa história ganhou uma data oficial. Foi quando Matheus e Cecília começaram a escrever esse amor como namorados.",
    imageUrl: ""
  }
];

const timeline = document.getElementById("timeline");
const timelineStatus = document.getElementById("timelineStatus");
const daysTogether = document.getElementById("daysTogether");
const hoursTogether = document.getElementById("hoursTogether");
const minutesTogether = document.getElementById("minutesTogether");
const heartsContainer = document.getElementById("heartsContainer");
const momentForm = document.getElementById("momentForm");
const saveMomentButton = document.getElementById("saveMomentButton");
const formStatus = document.getElementById("formStatus");
const setupCard = document.getElementById("setupCard");
const momentModal = document.getElementById("momentModal");
const momentModalBackdrop = document.getElementById("momentModalBackdrop");
const closeMomentModalButton = document.getElementById("closeMomentModal");
const modalMomentImage = document.getElementById("modalMomentImage");
const modalMomentPlaceholder = document.getElementById("modalMomentPlaceholder");
const modalMomentDate = document.getElementById("modalMomentDate");
const modalMomentTitle = document.getElementById("modalMomentTitle");
const modalMomentDescription = document.getElementById("modalMomentDescription");

let db = null;
let auth = null;
let firebaseReady = false;
let onlineMoments = [];
let timelineObserver = null;
let elementFocusedBeforeModal = null;

const maxImageSizeInBytes = 5 * 1024 * 1024;

function isFirebaseConfigured() {
  const requiredValues = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.appId
  ];

  return requiredValues.every((value) => value && !String(value).includes("COLE_"));
}

function setFormStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`.trim();
}

function setTimelineStatus(message) {
  timelineStatus.textContent = message;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function normalizeMoment(rawMoment, fallbackId) {
  return {
    id: rawMoment.id || fallbackId,
    date: String(rawMoment.date || "").slice(0, 10),
    title: String(rawMoment.title || "Momento nosso").trim(),
    description: String(rawMoment.description || "").trim(),
    imageUrl: String(rawMoment.imageUrl || rawMoment.image || "").trim(),
    cloudinaryPublicId: String(rawMoment.cloudinaryPublicId || "").trim()
  };
}

function isSafeImageUrl(url) {
  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    return ["http:", "https:"].includes(parsedUrl.protocol) ? parsedUrl.href : "";
  } catch {
    return "";
  }
}

function openMomentModal(moment) {
  const imageUrl = isSafeImageUrl(moment.imageUrl);
  elementFocusedBeforeModal = document.activeElement;

  modalMomentDate.textContent = formatDate(moment.date);
  modalMomentTitle.textContent = moment.title;
  modalMomentDescription.textContent = moment.description;

  if (imageUrl) {
    modalMomentImage.src = imageUrl;
    modalMomentImage.alt = moment.title;
    modalMomentImage.hidden = false;
    modalMomentPlaceholder.hidden = true;
  } else {
    modalMomentImage.removeAttribute("src");
    modalMomentImage.alt = "";
    modalMomentImage.hidden = true;
    modalMomentPlaceholder.hidden = false;
  }

  momentModal.hidden = false;
  document.body.classList.add("modal-open");
  closeMomentModalButton.focus();
}

function closeMomentModal() {
  if (momentModal.hidden) {
    return;
  }

  momentModal.hidden = true;
  document.body.classList.remove("modal-open");

  if (elementFocusedBeforeModal && typeof elementFocusedBeforeModal.focus === "function") {
    elementFocusedBeforeModal.focus();
  }
}

function handleModalKeydown(event) {
  if (event.key === "Escape") {
    closeMomentModal();
  }
}

function createTimelineItem(moment, index) {
  const item = document.createElement("article");
  item.className = "timeline-item";
  item.style.transitionDelay = `${Math.min(index * 80, 360)}ms`;

  const dot = document.createElement("div");
  dot.className = "timeline-dot";

  const content = document.createElement("div");
  content.className = "timeline-content";
  content.setAttribute("role", "button");
  content.setAttribute("tabindex", "0");
  content.setAttribute("aria-label", `Abrir momento: ${moment.title}`);

  const imageUrl = isSafeImageUrl(moment.imageUrl);
  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "timeline-photo";
    image.src = imageUrl;
    image.alt = moment.title;
    image.loading = "lazy";
    content.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "timeline-placeholder";
    placeholder.textContent = "Foto desse momento pode entrar aqui";
    content.appendChild(placeholder);
  }

  const title = document.createElement("h3");
  title.textContent = moment.title;

  content.append(title);
  content.addEventListener("click", () => openMomentModal(moment));
  content.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMomentModal(moment);
    }
  });

  item.append(dot, content);

  return item;
}

function observeTimelineItems() {
  const items = document.querySelectorAll(".timeline-item");

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("show"));
    return;
  }

  if (timelineObserver) {
    timelineObserver.disconnect();
  }

  timelineObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        timelineObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18 });

  items.forEach((item) => timelineObserver.observe(item));
}

function renderTimeline() {
  const allMoments = [...baseMoments, ...onlineMoments]
    .map((moment, index) => normalizeMoment(moment, `moment-${index}`))
    .filter((moment) => moment.date && moment.title && moment.description)
    .sort((a, b) => a.date.localeCompare(b.date));

  timeline.innerHTML = "";

  allMoments.forEach((moment, index) => {
    timeline.appendChild(createTimelineItem(moment, index));
  });

  observeTimelineItems();
}

function updateCounter() {
  const now = new Date();
  const diff = Math.max(0, now.getTime() - relationshipStart.getTime());
  const totalMinutes = Math.floor(diff / 60000);
  const totalHours = Math.floor(diff / 3600000);
  const totalDays = Math.floor(diff / 86400000);

  daysTogether.textContent = totalDays.toLocaleString("pt-BR");
  hoursTogether.textContent = totalHours.toLocaleString("pt-BR");
  minutesTogether.textContent = totalMinutes.toLocaleString("pt-BR");
}

function createHeart() {
  const heart = document.createElement("span");
  heart.className = "heart";
  heart.textContent = Math.random() > 0.5 ? "♥" : "♡";
  heart.style.left = `${Math.random() * 100}%`;
  heart.style.fontSize = `${Math.random() * 18 + 14}px`;
  heart.style.animationDuration = `${Math.random() * 3 + 5}s`;
  heartsContainer.appendChild(heart);

  window.setTimeout(() => {
    heart.remove();
  }, 8500);
}

function getSelectedImageFile() {
  return document.getElementById("momentImage").files[0] || null;
}

function validateImageFile(file) {
  if (!file) {
    return "";
  }

  if (!file.type.startsWith("image/")) {
    return "Escolha um arquivo de imagem válido.";
  }

  if (file.size > maxImageSizeInBytes) {
    return "A foto precisa ter no máximo 5MB.";
  }

  return "";
}

async function uploadMomentImage(file) {
  if (!file) {
    return {
      imageUrl: "",
      cloudinaryPublicId: ""
    };
  }

  if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
    throw new Error("Configuração do Cloudinary incompleta.");
  }

  const uploadData = new FormData();
  uploadData.append("file", file);
  uploadData.append("upload_preset", cloudinaryConfig.uploadPreset);

  setFormStatus("Enviando foto para o Cloudinary...");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: "POST",
    body: uploadData
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || "Falha ao enviar a foto para o Cloudinary.");
  }

  if (!result.secure_url) {
    throw new Error("O Cloudinary não retornou a URL da imagem.");
  }

  return {
    imageUrl: result.secure_url,
    cloudinaryPublicId: result.public_id || ""
  };
}

function initAnalytics(app) {
  if (!firebaseConfig.measurementId) {
    return;
  }

  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {});
}

async function initFirebase() {
  if (!isFirebaseConfigured()) {
    saveMomentButton.disabled = true;
    setupCard.hidden = false;
    setTimelineStatus("Salvamento online ainda não configurado. Os momentos iniciais já aparecem normalmente.");
    setFormStatus("Confira os dados do firebaseConfig no script.js para liberar o botão de salvar.", "error");
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    initAnalytics(app);

    auth = getAuth(app);
    await setPersistence(auth, browserSessionPersistence);
    db = getFirestore(app);
    firebaseReady = true;

    setupCard.hidden = true;
    saveMomentButton.disabled = false;
    setTimelineStatus("Carregando momentos salvos online...");
    setFormStatus("Digite um e-mail autorizado e a senha para salvar um novo momento.");

    onSnapshot(collection(db, "momentos"), (snapshot) => {
      onlineMoments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      renderTimeline();
      setTimelineStatus(onlineMoments.length
        ? `${onlineMoments.length} momento(s) online carregado(s).`
        : "Pronto para receber novos momentos online."
      );
    }, (error) => {
      setTimelineStatus("Não foi possível carregar os momentos online. Confira as regras do Firestore.");
      setFormStatus(`Erro do Firebase: ${error.message}`, "error");
    });
  } catch (error) {
    saveMomentButton.disabled = true;
    setTimelineStatus("Não foi possível iniciar o Firebase.");
    setFormStatus(`Erro ao iniciar Firebase: ${error.message}`, "error");
  }
}

async function handleMomentSubmit(event) {
  event.preventDefault();

  if (!firebaseReady) {
    setFormStatus("Configure o Firebase antes de salvar momentos online.", "error");
    return;
  }

  const formData = {
    date: document.getElementById("momentDate").value,
    title: document.getElementById("momentTitle").value.trim(),
    description: document.getElementById("momentDescription").value.trim(),
  };
  const accessEmail = document.getElementById("accessEmail").value.trim().toLowerCase();
  const password = document.getElementById("accessPassword").value;
  const imageFile = getSelectedImageFile();
  const imageError = validateImageFile(imageFile);

  if (!formData.date || !formData.title || !formData.description || !accessEmail || !password) {
    setFormStatus("Preencha data, título, descrição, e-mail e senha para salvar.", "error");
    return;
  }

  if (imageError) {
    setFormStatus(imageError, "error");
    return;
  }

  saveMomentButton.disabled = true;
  setFormStatus("Validando senha e salvando momento...");

  try {
    await signInWithEmailAndPassword(auth, accessEmail, password);

    const momentReference = doc(collection(db, "momentos"));
    const imageData = await uploadMomentImage(imageFile);

    setFormStatus("Salvando momento...");
    await setDoc(momentReference, {
      ...formData,
      ...imageData,
      createdAt: serverTimestamp(),
      createdBy: accessEmail
    });

    momentForm.reset();
    setFormStatus("Momento salvo online com sucesso.", "success");
  } catch (error) {
    const wrongPasswordCodes = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"];
    let message = `Não foi possível salvar: ${error.message}`;

    if (wrongPasswordCodes.includes(error.code)) {
      message = "E-mail ou senha incorretos.";
    }

    if (error.code === "permission-denied") {
      message = "Esse e-mail não tem permissão para adicionar momentos.";
    }

    setFormStatus(message, "error");
  } finally {
    await signOut(auth).catch(() => {});
    saveMomentButton.disabled = false;
    document.getElementById("accessPassword").value = "";
  }
}

renderTimeline();
updateCounter();
initFirebase();

window.setInterval(updateCounter, 60000);
window.setInterval(createHeart, 900);
momentForm.addEventListener("submit", handleMomentSubmit);
closeMomentModalButton.addEventListener("click", closeMomentModal);
momentModalBackdrop.addEventListener("click", closeMomentModal);
window.addEventListener("keydown", handleModalKeydown);
