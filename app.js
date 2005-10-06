import { db } from "./firebase.js";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Elements ---
const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const formError = document.getElementById("form-error");
const taskList = document.getElementById("task-list");
const loadingState = document.getElementById("loading-state");
const globalError = document.getElementById("global-error");
const emptyState = document.getElementById("empty-state");
const taskCounter = document.getElementById("task-counter");
const filterButtons = document.querySelectorAll(".filter-btn");

// --- Application State ---
let tasks = [];
let currentFilter = "all";

// Firestore tasks collection reference
const tasksCollection = collection(db, "tasks");

/**
 * Listens for real-time Firestore updates and updates the UI automatically
 */
function initApp() {
  const q = query(tasksCollection, orderBy("createdAt", "desc"));

  onSnapshot(
    q,
    (snapshot) => {
      tasks = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      loadingState.hidden = true;
      globalError.hidden = true;
      render();
    },
    (error) => {
      console.error("Firestore Error:", error);
      loadingState.hidden = true;
      showGlobalError("Failed to fetch tasks. Please check your network connection.");
    }
  );
}

/**
 * Renders the tasks list and updates task counter
 */
function render() {
  const filteredTasks = filterTasks(tasks, currentFilter);
  taskList.innerHTML = "";

  if (filteredTasks.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    filteredTasks.forEach((task) => {
      const taskElement = createTaskElement(task);
      taskList.appendChild(taskElement);
    });
  }

  updateTaskCounter();
}

/**
 * Filters the list of tasks based on selected filter
 */
function filterTasks(taskListData, filter) {
  if (filter === "active") return taskListData.filter((t) => !t.completed);
  if (filter === "completed") return taskListData.filter((t) => t.completed);
  return taskListData;
}

/**
 * Constructs DOM nodes for a single task item
 */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item ${task.completed ? "completed" : ""}`;
  li.dataset.id = task.id;

  // Task content wrapper
  const contentDiv = document.createElement("div");
  contentDiv.className = "task-content";

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Mark "${task.title}" as completed`);
  checkbox.dataset.action = "toggle";

  // Title text (securely injected via textContent to prevent XSS)
  const titleSpan = document.createElement("span");
  titleSpan.className = "task-title";
  titleSpan.textContent = task.title;
  titleSpan.dataset.action = "edit-trigger";

  contentDiv.appendChild(checkbox);
  contentDiv.appendChild(titleSpan);

  // Action buttons wrapper
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "task-actions";

  // Edit Button
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-action";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("aria-label", `Edit task "${task.title}"`);
  editBtn.dataset.action = "edit-trigger";

  // Delete Button
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn-action btn-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete task "${task.title}"`);
  deleteBtn.dataset.action = "delete";

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  li.appendChild(contentDiv);
  li.appendChild(actionsDiv);

  return li;
}

/**
 * Updates task counter for active tasks remaining
 */
function updateTaskCounter() {
  const activeCount = tasks.filter((t) => !t.completed).length;
  taskCounter.textContent = `${activeCount} ${activeCount === 1 ? "task" : "tasks"} left`;
}

/**
 * Form Submit: Adds a new task to Firestore
 */
async function handleAddTask(event) {
  event.preventDefault();
  const title = taskInput.value.trim();

  if (!title) {
    showFormError("Task title cannot be empty.");
    return;
  }
  if (title.length > 100) {
    showFormError("Task title cannot exceed 100 characters.");
    return;
  }

  clearFormError();

  try {
    await addDoc(tasksCollection, {
      title: title,
      completed: false,
      createdAt: serverTimestamp()
    });
    taskInput.value = "";
  } catch (error) {
    console.error("Error adding document: ", error);
    showFormError("Failed to add task. Try again.");
  }
}

/**
 * Event Delegation Handler: Handles clicks on toggle, edit, and delete elements
 */
async function handleListClick(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;

  const taskItem = target.closest(".task-item");
  if (!taskItem) return;

  const taskId = taskItem.dataset.id;

  // Toggle Completion Status
  if (action === "toggle") {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, { completed: !task.completed });
    } catch (error) {
      console.error("Error toggling task:", error);
      showGlobalError("Failed to update status.");
    }
  }

  // Delete Task
  else if (action === "delete") {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${task.title}"?`);
    if (confirmed) {
      try {
        const taskRef = doc(db, "tasks", taskId);
        await deleteDoc(taskRef);
      } catch (error) {
        console.error("Error deleting task:", error);
        showGlobalError("Failed to delete task.");
      }
    }
  }

  // Trigger Inline Editing
  else if (action === "edit-trigger") {
    enableInlineEdit(taskItem, taskId);
  }
}

/**
 * Replaces span title with input box for editing task titles
 */
function enableInlineEdit(taskItem, taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const contentDiv = taskItem.querySelector(".task-content");
  const titleSpan = contentDiv.querySelector(".task-title");

  if (contentDiv.querySelector(".edit-input")) return; // Prevent duplicate inputs

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "edit-input";
  editInput.value = task.title;
  editInput.maxLength = 100;

  titleSpan.hidden = true;
  contentDiv.appendChild(editInput);
  editInput.focus();

  const saveEdit = async () => {
    const newTitle = editInput.value.trim();

    if (!newTitle) {
      alert("Task title cannot be empty.");
      editInput.value = task.title;
      cleanup();
      return;
    }

    if (newTitle !== task.title) {
      try {
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, { title: newTitle });
      } catch (error) {
        console.error("Error saving title:", error);
        showGlobalError("Failed to update task.");
      }
    }
    cleanup();
  };

  const cleanup = () => {
    editInput.removeEventListener("blur", saveEdit);
    editInput.removeEventListener("keydown", handleKeyDown);
    if (editInput.parentNode) editInput.remove();
    titleSpan.hidden = false;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cleanup();
    }
  };

  editInput.addEventListener("blur", saveEdit);
  editInput.addEventListener("keydown", handleKeyDown);
}

/**
 * Handles switching active filter state
 */
function handleFilterChange(event) {
  const button = event.target.closest(".filter-btn");
  if (!button) return;

  filterButtons.forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-pressed", "false");
  });

  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");

  currentFilter = button.dataset.filter;
  render();
}

// --- Helper Functions for Errors ---
function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function clearFormError() {
  formError.textContent = "";
  formError.hidden = true;
}

function showGlobalError(msg) {
  globalError.textContent = msg;
  globalError.hidden = false;
  setTimeout(() => {
    globalError.hidden = true;
  }, 5000);
}

// --- Event Listeners ---
taskForm.addEventListener("submit", handleAddTask);
taskList.addEventListener("click", handleListClick);
document.querySelector(".filters").addEventListener("click", handleFilterChange);

// --- App Initialization ---
initApp();