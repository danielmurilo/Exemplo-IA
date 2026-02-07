const STORAGE_KEY = "gastosPessoais";

const pasteInput = document.getElementById("pasteInput");
const processButton = document.getElementById("processButton");
const clearButton = document.getElementById("clearButton");
const confirmClear = document.getElementById("confirmClear");
const expensesTableBody = document.querySelector("#expensesTable tbody");
const totalValue = document.getElementById("totalValue");
const toastContainer = document.getElementById("toastContainer");
const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));

let expenses = loadExpenses();
renderTable();

processButton.addEventListener("click", () => {
  const raw = pasteInput.value.trim();
  if (!raw) {
    showToast("Cole os dados da planilha antes de processar.", "warning");
    return;
  }

  const { entries, ignored } = parseSpreadsheet(raw);
  if (entries.length === 0) {
    showToast("Nenhuma linha válida encontrada. Verifique o formato.", "danger");
    return;
  }

  expenses = [...entries, ...expenses];
  saveExpenses();
  renderTable();
  pasteInput.value = "";

  const ignoredText = ignored > 0 ? ` (${ignored} linha(s) ignoradas)` : "";
  showToast(`Importação concluída com sucesso!${ignoredText}`, "success");
});

clearButton.addEventListener("click", () => {
  if (expenses.length === 0) {
    showToast("Nenhum dado salvo para remover.", "info");
    return;
  }
  confirmModal.show();
});

confirmClear.addEventListener("click", () => {
  expenses = [];
  saveExpenses();
  renderTable();
  confirmModal.hide();
  showToast("Todos os gastos foram removidos.", "success");
});

function parseSpreadsheet(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const entries = [];
  let ignored = 0;

  lines.forEach((line) => {
    const delimiter = detectDelimiter(line);
    const parts = line.split(delimiter).map((item) => item.trim());

    if (parts.length < 3) {
      ignored += 1;
      return;
    }

    const [date, description, categoryRaw, valueRaw] = normalizeColumns(parts);

    if (!date || !description || !valueRaw) {
      ignored += 1;
      return;
    }

    const value = parseCurrency(valueRaw);
    if (Number.isNaN(value)) {
      ignored += 1;
      return;
    }

    const category = categoryRaw || inferCategory(description);

    entries.push({
      date,
      description,
      category,
      value,
    });
  });

  return { entries, ignored };
}

function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function normalizeColumns(parts) {
  if (parts.length === 3) {
    return [parts[0], parts[1], "", parts[2]];
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

function parseCurrency(valueRaw) {
  const normalized = valueRaw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  return Number(normalized);
}

function inferCategory(description) {
  const text = description.toLowerCase();
  const rules = [
    { keywords: ["uber", "99", "ônibus", "metro", "gasolina", "combustível"], category: "Transporte" },
    { keywords: ["mercado", "supermercado", "restaurante", "café", "ifood", "lanche"], category: "Alimentação" },
    { keywords: ["farmácia", "consulta", "médico", "hospital", "saúde"], category: "Saúde" },
    { keywords: ["netflix", "spotify", "cinema", "streaming", "show"], category: "Lazer" },
    { keywords: ["aluguel", "condomínio", "energia", "água", "internet"], category: "Moradia" },
    { keywords: ["curso", "livro", "escola", "faculdade"], category: "Educação" },
  ];

  const match = rules.find((rule) => rule.keywords.some((word) => text.includes(word)));
  return match ? match.category : "Outros";
}

function renderTable() {
  expensesTableBody.innerHTML = "";
  if (expenses.length === 0) {
    expensesTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">Nenhum gasto registrado ainda.</td>
      </tr>
    `;
    totalValue.textContent = "Total: R$ 0,00";
    return;
  }

  expenses.forEach((expense) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.description}</td>
      <td><span class="badge text-bg-info">${expense.category}</span></td>
      <td class="text-end">${formatCurrency(expense.value)}</td>
    `;
    expensesTableBody.appendChild(row);
  });

  const total = expenses.reduce((sum, expense) => sum + expense.value, 0);
  totalValue.textContent = `Total: ${formatCurrency(total)}`;
}

function showToast(message, variant = "primary") {
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-bg-${variant} border-0 show`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
    </div>
  `;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function loadExpenses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function formatCurrency(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
