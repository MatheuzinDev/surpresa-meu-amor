import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
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

const timeline = document.getElementById("timeline");
const timelineStatus = document.getElementById("timelineStatus");
const daysTogether = document.getElementById("daysTogether");
const hoursTogether = document.getElementById("hoursTogether");
const minutesTogether = document.getElementById("minutesTogether");
const heartsContainer = document.getElementById("heartsContainer");
const momentForm = document.getElementById("momentForm");
const momentFormTitle = document.getElementById("momentFormTitle");
const saveMomentButton = document.getElementById("saveMomentButton");
const loginButton = document.getElementById("loginButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const formStatus = document.getElementById("formStatus");
const authFields = document.getElementById("authFields");
const accessEmailInput = document.getElementById("accessEmail");
const accessPasswordInput = document.getElementById("accessPassword");
const managerStatus = document.getElementById("managerStatus");
const managerStatusText = document.getElementById("managerStatusText");
const logoutButton = document.getElementById("logoutButton");
const momentModal = document.getElementById("momentModal");
const momentModalBackdrop = document.getElementById("momentModalBackdrop");
const closeMomentModalButton = document.getElementById("closeMomentModal");
const modalMomentActions = document.getElementById("modalMomentActions");
const editMomentButton = document.getElementById("editMomentButton");
const deleteMomentButton = document.getElementById("deleteMomentButton");
const modalMomentImage = document.getElementById("modalMomentImage");
const modalMomentPlaceholder = document.getElementById("modalMomentPlaceholder");
const modalMomentDate = document.getElementById("modalMomentDate");
const modalMomentTitle = document.getElementById("modalMomentTitle");
const modalMomentDescription = document.getElementById("modalMomentDescription");

let db = null;
let auth = null;
let firebaseReady = false;
let moments = [];
let timelineObserver = null;
let elementFocusedBeforeModal = null;
let currentUser = null;
let currentModalMoment = null;
let editingMoment = null;

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
  currentModalMoment = moment;

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
  updateModalActions();
  closeMomentModalButton.focus();
}

function closeMomentModal() {
  if (momentModal.hidden) {
    return;
  }

  momentModal.hidden = true;
  document.body.classList.remove("modal-open");
  currentModalMoment = null;

  if (elementFocusedBeforeModal && typeof elementFocusedBeforeModal.focus === "function") {
    elementFocusedBeforeModal.focus();
  }
}

function handleModalKeydown(event) {
  if (event.key === "Escape") {
    closeMomentModal();
  }
}

function updateModalActions() {
  modalMomentActions.hidden = !currentUser || !currentModalMoment;
}

function updateManagerState() {
  const isLoggedIn = Boolean(currentUser);

  managerStatus.hidden = !isLoggedIn;
  authFields.hidden = isLoggedIn;
  loginButton.hidden = isLoggedIn;
  accessEmailInput.disabled = isLoggedIn;
  accessPasswordInput.disabled = isLoggedIn;
  accessEmailInput.required = !isLoggedIn;
  accessPasswordInput.required = !isLoggedIn;

  if (isLoggedIn) {
    managerStatusText.textContent = `Modo edição ativo: ${currentUser.email}`;
    accessPasswordInput.value = "";
  }

  updateModalActions();
}

function getAuthFields() {
  return {
    accessEmail: accessEmailInput.value.trim().toLowerCase(),
    password: accessPasswordInput.value
  };
}

async function getAuthenticatedUser() {
  if (currentUser) {
    return currentUser;
  }

  const { accessEmail, password } = getAuthFields();

  if (!accessEmail || !password) {
    throw new Error("Digite e-mail e senha para continuar.");
  }

  const credential = await signInWithEmailAndPassword(auth, accessEmail, password);
  return credential.user;
}

function resetMomentForm(options = {}) {
  const { clearStatus = true } = options;

  editingMoment = null;
  momentForm.reset();
  momentFormTitle.textContent = "Adicionar momento nosso";
  saveMomentButton.textContent = "Salvar momento";
  cancelEditButton.hidden = true;
  accessPasswordInput.value = "";

  if (clearStatus) {
    setFormStatus(currentUser
      ? "Modo edição ativo. Você pode adicionar, editar ou apagar momentos."
      : "Digite um e-mail autorizado e a senha para salvar um novo momento."
    );
  }
}

function startEditMoment(moment) {
  editingMoment = moment;
  document.getElementById("momentDate").value = moment.date;
  document.getElementById("momentTitle").value = moment.title;
  document.getElementById("momentDescription").value = moment.description;
  document.getElementById("momentImage").value = "";
  momentFormTitle.textContent = "Editar momento";
  saveMomentButton.textContent = "Atualizar momento";
  cancelEditButton.hidden = false;
  closeMomentModal();
  setFormStatus("Edite os campos e salve. Se escolher uma nova foto, a antiga será substituída.");
  momentForm.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const allMoments = [...moments]
    .map((moment, index) => normalizeMoment(moment, `moment-${index}`))
    .filter((moment) => moment.date && moment.title && moment.description)
    .sort((a, b) => a.date.localeCompare(b.date));

  timeline.innerHTML = "";

  if (!allMoments.length) {
    setTimelineStatus("Ainda não há momentos por aqui. Adicione o primeiro.");
    return;
  }

  setTimelineStatus("");

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
    throw new Error("Não foi possível preparar o envio da foto.");
  }

  const uploadData = new FormData();
  uploadData.append("file", file);
  uploadData.append("upload_preset", cloudinaryConfig.uploadPreset);

  setFormStatus("Enviando foto...");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: "POST",
    body: uploadData
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || "Falha ao enviar a foto.");
  }

  if (!result.secure_url) {
    throw new Error("Não foi possível obter a imagem enviada.");
  }

  return {
    imageUrl: result.secure_url,
    cloudinaryPublicId: result.public_id || ""
  };
}

async function deleteCloudinaryImage(publicId) {
  if (!publicId || !currentUser) {
    return;
  }

  const token = await currentUser.getIdToken();
  const response = await fetch("/api/delete-cloudinary-image", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ publicId })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível apagar a imagem.");
  }
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
    setTimelineStatus("Ainda não há momentos por aqui. Adicione o primeiro.");
    setFormStatus("Não foi possível preparar o salvamento.", "error");
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    initAnalytics(app);

    auth = getAuth(app);
    await setPersistence(auth, browserSessionPersistence);
    db = getFirestore(app);
    firebaseReady = true;

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      updateManagerState();

      if (user) {
        setFormStatus("Modo edição ativo. Você pode adicionar, editar ou apagar momentos.");
      }
    });

    saveMomentButton.disabled = false;
    setTimelineStatus("Carregando momentos...");
    setFormStatus("Digite um e-mail autorizado e a senha para salvar um novo momento.");

    onSnapshot(collection(db, "momentos"), (snapshot) => {
      moments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      renderTimeline();
    }, (error) => {
      setTimelineStatus("Não foi possível carregar os momentos.");
      setFormStatus(`Não foi possível carregar os momentos: ${error.message}`, "error");
    });
  } catch (error) {
    saveMomentButton.disabled = true;
    setTimelineStatus("Não foi possível carregar os momentos.");
    setFormStatus(`Não foi possível preparar o salvamento: ${error.message}`, "error");
  }
}

async function handleMomentSubmit(event) {
  event.preventDefault();

  if (!firebaseReady) {
    setFormStatus("Não foi possível preparar o salvamento.", "error");
    return;
  }

  const formData = {
    date: document.getElementById("momentDate").value,
    title: document.getElementById("momentTitle").value.trim(),
    description: document.getElementById("momentDescription").value.trim(),
  };
  const imageFile = getSelectedImageFile();
  const imageError = validateImageFile(imageFile);

  if (!formData.date || !formData.title || !formData.description) {
    setFormStatus("Preencha data, título e descrição para salvar.", "error");
    return;
  }

  if (imageError) {
    setFormStatus(imageError, "error");
    return;
  }

  saveMomentButton.disabled = true;
  setFormStatus(currentUser ? "Salvando momento..." : "Validando acesso e salvando momento...");

  try {
    const user = await getAuthenticatedUser();

    if (editingMoment) {
      let imageData = {};
      const oldPublicId = editingMoment.cloudinaryPublicId;

      if (imageFile) {
        imageData = await uploadMomentImage(imageFile);
      }

      setFormStatus("Atualizando momento...");
      await updateDoc(doc(db, "momentos", editingMoment.id), {
        ...formData,
        ...(imageFile ? imageData : {
          imageUrl: editingMoment.imageUrl || "",
          cloudinaryPublicId: editingMoment.cloudinaryPublicId || ""
        }),
        updatedAt: serverTimestamp(),
        updatedBy: user.email
      });

      if (imageFile && oldPublicId && oldPublicId !== imageData.cloudinaryPublicId) {
        try {
          await deleteCloudinaryImage(oldPublicId);
        } catch (deleteError) {
          setFormStatus(`Momento atualizado, mas a foto antiga não foi removida: ${deleteError.message}`, "error");
          resetMomentForm({ clearStatus: false });
          return;
        }
      }

      resetMomentForm({ clearStatus: false });
      setFormStatus("Momento atualizado com sucesso.", "success");
      return;
    }

    const momentReference = doc(collection(db, "momentos"));
    const imageData = await uploadMomentImage(imageFile);
    setFormStatus("Salvando momento...");
    await setDoc(momentReference, {
      ...formData,
      ...imageData,
      createdAt: serverTimestamp(),
      createdBy: user.email
    });

    resetMomentForm({ clearStatus: false });
    setFormStatus("Momento salvo com sucesso.", "success");
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
    saveMomentButton.disabled = false;
    document.getElementById("accessPassword").value = "";
  }
}

async function handleLoginClick() {
  if (!firebaseReady) {
    setFormStatus("Não foi possível preparar o acesso.", "error");
    return;
  }

  loginButton.disabled = true;
  setFormStatus("Validando acesso...");

  try {
    await getAuthenticatedUser();
    setFormStatus("Acesso liberado. Abra um momento para editar ou apagar.", "success");
  } catch (error) {
    const wrongPasswordCodes = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"];
    const message = wrongPasswordCodes.includes(error.code)
      ? "E-mail ou senha incorretos."
      : `Não foi possível entrar: ${error.message}`;

    setFormStatus(message, "error");
  } finally {
    loginButton.disabled = false;
    accessPasswordInput.value = "";
  }
}

async function handleLogoutClick() {
  await signOut(auth);
  resetMomentForm({ clearStatus: false });
  setFormStatus("Você saiu do modo edição.");
}

async function handleDeleteMoment() {
  if (!currentModalMoment || !currentUser) {
    return;
  }

  const shouldDelete = window.confirm("Tem certeza que deseja apagar este momento?");
  if (!shouldDelete) {
    return;
  }

  const momentToDelete = currentModalMoment;
  deleteMomentButton.disabled = true;
  editMomentButton.disabled = true;

  try {
    await deleteDoc(doc(db, "momentos", momentToDelete.id));

    let imageDeleteError = null;

    if (momentToDelete.cloudinaryPublicId) {
      try {
        await deleteCloudinaryImage(momentToDelete.cloudinaryPublicId);
      } catch (error) {
        imageDeleteError = error;
      }
    }

    if (editingMoment?.id === momentToDelete.id) {
      resetMomentForm({ clearStatus: false });
    }

    closeMomentModal();

    if (imageDeleteError) {
      setFormStatus(`Momento apagado, mas a imagem pode precisar ser removida manualmente: ${imageDeleteError.message}`, "error");
      return;
    }

    setFormStatus("Momento apagado com sucesso.", "success");
  } catch (error) {
    setFormStatus(`Não foi possível apagar o momento: ${error.message}`, "error");
  } finally {
    deleteMomentButton.disabled = false;
    editMomentButton.disabled = false;
  }
}

renderTimeline();
updateCounter();
initFirebase();

window.setInterval(updateCounter, 60000);
window.setInterval(createHeart, 900);
momentForm.addEventListener("submit", handleMomentSubmit);
loginButton.addEventListener("click", handleLoginClick);
logoutButton.addEventListener("click", handleLogoutClick);
cancelEditButton.addEventListener("click", () => resetMomentForm());
editMomentButton.addEventListener("click", () => {
  if (currentModalMoment) {
    startEditMoment(currentModalMoment);
  }
});
deleteMomentButton.addEventListener("click", handleDeleteMoment);
closeMomentModalButton.addEventListener("click", closeMomentModal);
momentModalBackdrop.addEventListener("click", closeMomentModal);
window.addEventListener("keydown", handleModalKeydown);
