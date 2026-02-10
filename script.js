const STORAGE_KEY = "gastosPessoais";

const pasteInput = document.getElementById("pasteInput");
const processButton = document.getElementById("processButton");
const exportButton = document.getElementById("exportButton");
const clearButton = document.getElementById("clearButton");
const confirmClear = document.getElementById("confirmClear");
const expensesTableBody = document.querySelector("#expensesTable tbody");
const totalValue = document.getElementById("totalValue");
const toastContainer = document.getElementById("toastContainer");
const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));

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

exportButton.addEventListener("click", () => {
  if (expenses.length === 0) {
    showToast("Não há dados para exportar.", "warning");
    return;
  }
  const csvContent = generateCSV();
  downloadCSV(csvContent);
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
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const entries = [];
  let ignored = 0;

  lines.forEach((line) => {
    // 1. Detect delimiter and split (Tab > Semicolon > Comma > Pipe)
    let parts = [];
    if (line.includes("\t")) {
      parts = line.split("\t");
    } else if (line.includes(";")) {
      parts = line.split(";");
    } else if (line.includes(",")) {
      // CSVs are tricky without a real parser, but we'll try simple split
      parts = line.split(",");
    } else {
      parts = line.split(" "); // Fallback for space separated?
    }

    parts = parts.map((item) => item.trim()).filter((item) => item !== "");

    if (parts.length < 2) {
      ignored++;
      return;
    }

    // 2. Smart Field Extraction
    const { date, value, description, category, type } = extractFieldsSmart(parts);

    if (!date || !description || isNaN(value)) {
      ignored++;
      return;
    }

    entries.push({
      date,
      description,
      category,
      type,
      value,
    });
  });

  return { entries, ignored };
}

function extractFieldsSmart(parts) {
  let date = null;
  let value = NaN;
  let descriptionParts = [];
  let categoryRaw = "";
  let usedIndices = new Set();

  // A. Find Date (Priority: Looks like a Date)
  // Supports: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, and DD/MM (current year)
  const dateRegex = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})|(\d{1,2}[\/\-\.]\d{1,2})$/;

  for (let i = 0; i < parts.length; i++) {
    if (dateRegex.test(parts[i])) {
      date = parts[i];
      // If date is short (DD/MM), append current year
      if (/^\d{1,2}[\/\-\.]\d{1,2}$/.test(date)) {
        const currentYear = new Date().getFullYear();
        date = `${date}/${currentYear}`;
      }
      usedIndices.add(i);
      break; // Stop at first valid date
    }
  }

  // B. Find Value (Priority: Looks like a Number/Currency)
  // Search from end to start (Value is usually last)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (usedIndices.has(i)) continue; // Don't use the date column

    const v = parseCurrency(parts[i]);
    if (!isNaN(v)) {
      value = v;
      usedIndices.add(i);
      break; // Stop at last valid number
    }
  }

  // C. Identify Description (Agglutinate all leftovers)
  const leftovers = parts.filter((_, i) => !usedIndices.has(i));

  let description = "";

  if (leftovers.length === 0) {
    description = "Sem descrição";
  } else {
    // Join everything else as description
    description = leftovers.join(" ");
  }

  // Always infer category from the full description + value
  const classification = inferCategory(description, value);
  const category = classification.category;
  const type = classification.type;

  // Adjust value sign based on type
  if (type === 'expense') {
    value = -Math.abs(value);
  } else {
    value = Math.abs(value);
  }

  return { date, value, description, category, type };
}

function parseCurrency(valueRaw) {
  if (!valueRaw) return NaN;

  // 1. Strict Filter: If it contains letters (except valid currency symbols), it's likely a description.
  // Remove common currency symbols to check for "real" letters
  const textWithoutCurrency = valueRaw.replace(/R\$|US\$|\$|€|£/gi, "").trim();

  // If it still has letters, it's not a number (e.g. "Uber 123")
  if (/[a-zA-Z]/.test(textWithoutCurrency)) return NaN;

  // 2. Cleaning
  let clean = valueRaw.replace(/[^\d,\.\-]/g, "");

  // Detect edge case: empty or just minus
  if (!clean || clean === "-") return NaN;

  // Pattern Detection for "1.234,56" vs "1,234.56"
  const lastDot = clean.lastIndexOf(".");
  const lastComma = clean.lastIndexOf(",");

  if (lastComma > lastDot) {
    // Comma is decimal Separator (Brazilian Standard)
    // Remove all dots (thousands), replace comma with dot
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Dot is decimal Separator (International Standard)
    // Remove all commas
    clean = clean.replace(/,/g, "");
  }

  // Refined Logic for Single Separator:
  if (lastComma !== -1 && lastDot === -1) {
    // Only commas. "10,50" -> 10.50
    clean = clean.replace(",", ".");
  } else if (lastComma === -1 && lastDot !== -1) {
    // Only dots. "10.50" or "1.000"
    const parts = clean.split(".");
    // Heuristic: If last part is 3 digits, assumption is thousands.
    // Unless it's small? "1.200" could be 1200 or 1.2
    // Financial apps in BR/US context: "1.200" is ambiguous.
    // But usually Excel exports "1000.00" or "1000".
    // If user types "1.500", they usually mean 1500.
    // If user types "10.50", they mean 10.5.
    if (parts[parts.length - 1].length === 3) {
      clean = clean.replace(/\./g, "");
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) ? NaN : num;
}

// --- Smart Classifier Logic ---

class SmartClassifier {
  constructor() {
    this.dataset = [
      // --- DESPESAS (type: 'expense') ---

      // Viagem por App
      { terms: ["uber", "99", "99pop", "cabify", "indriver"], category: "Viagem por App", type: "expense" },

      // Transporte Público
      { terms: ["ônibus", "metro", "metrô", "trem", "passagem", "bilhete", "cptm", "sptrans", "top"], category: "Transporte Público", type: "expense" },

      // Combustível
      { terms: ["posto", "gasolina", "etanol", "combustível", "ipiranga", "shell", "br", "abastecimento", "petrobras"], category: "Combustível", type: "expense" },

      // Manutenção Veicular
      { terms: ["mecânico", "oficina", "revisão", "pneu", "peças", "troca de óleo", "balanceamento", "funilaria", "bateria"], category: "Manutenção Veicular", type: "expense" },

      // Supermercado
      { terms: ["mercado", "supermercado", "hipermercado", "atacadao", "assai", "carrefour", "pão de açúcar", "dia", "extra", "sonda", "zaffari", "mambo", "tenda", "sams club"], category: "Supermercado", type: "expense" },

      // Alimentação Fora de Casa
      { terms: ["restaurante", "lanchonete", "padaria", "bar", "pub", "cafe", "coffee", "ifood", "rappi", "uber eats", "burger", "mcdonalds", "pizza", "sushi", "açaí", "sorvete", "starbucks", "outback"], category: "Alimentação Fora de Casa", type: "expense" },

      // Streaming e Assinaturas
      { terms: ["netflix", "spotify", "youtube", "amazon prime", "disney", "hbo", "globoplay", "appletv", "paramount", "deezer", "assinatura", "adobe", "google one", "icloud"], category: "Streaming e Assinaturas", type: "expense" },

      // Lazer
      { terms: ["cinema", "ingresso", "show", "teatro", "museu", "parque", "clube", "steam", "playstation", "xbox", "nintendo", "jogo", "game", "sympla", "eventim"], category: "Lazer", type: "expense" },

      // Despesa Fixa (Moradia/Contas)
      { terms: ["aluguel", "condomínio", "luz", "energia", "enel", "light", "cpfl", "água", "sabesp", "gás", "iptu", "net", "vivo", "claro", "tim", "internet", "oi", "celular", "conta", "mensalidade"], category: "Despesa Fixa", type: "expense" },

      // Manutenção Residencial
      { terms: ["leroy", "telhanorte", "manutenção", "conserto", "eletricista", "encanador", "limpeza", "faxina", "diarista", "c&c", "sodimac", "casa e construção"], category: "Manutenção Residencial", type: "expense" },

      // Saúde
      { terms: ["farmácia", "drogaria", "drogasil", "raia", "pague menos", "ultrafarma", "medicamento", "remédio", "médico", "consulta", "exame", "laboratório", "hospital", "dentista", "ortodontista", "psicólogo", "terapia", "plano de saúde", "unimed", "sulamerica", "bradesco saude"], category: "Saúde", type: "expense" },

      // Educação
      { terms: ["escola", "colégio", "faculdade", "universidade", "curso", "udemy", "alura", "coursera", "livro", "saraiva", "amazon", "papelaria", "material escolar", "idiomas", "inglês"], category: "Educação", type: "expense" },

      // Vestuário
      { terms: ["roupa", "vestuário", "sapato", "tênis", "camisa", "calça", "zara", "renner", "c&a", "riachuelo", "shein", "privalia", "dafiti", "nike", "adidas", "centauro"], category: "Vestuário", type: "expense" },

      // Seguros
      { terms: ["seguro", "porto seguro", "azul seguros", "tokio marine", "allianz", "liberty", "suhai"], category: "Seguros", type: "expense" },

      // Serviços Profissionais
      { terms: ["advogado", "contador", "consultoria", "cartório", "despachante"], category: "Serviços Profissionais", type: "expense" },

      // Impostos e Taxas
      { terms: ["iof", "tarifa", "anuidade", "juros", "taxa", "multa", "darf", "das", "irpf"], category: "Impostos e Taxas", type: "expense" },

      // Cartão de Crédito (Pagamento da fatura)
      { terms: ["fatura", "cartão", "card", "visa", "mastercard", "amex", "nubank", "inter"], category: "Cartão de Crédito", type: "expense" },

      // Compras Parceladas (Generic keyword match for installments if descriptive text implies it)
      { terms: ["parcela", "1/", "2/", "3/", "4/", "5/", "6/", "7/", "8/", "9/", "10/", "11/", "12/"], category: "Compras Parceladas", type: "expense" },

      // --- RECEITAS (type: 'income') ---

      // Salário
      { terms: ["salário", "holerite", "proventos", "folha"], category: "Salário", type: "income" },

      // Freelance
      { terms: ["freela", "serviço prestado", "job", "projeto"], category: "Freelance", type: "income" },

      // Reembolso
      { terms: ["reembolso", "estorno", "devolução", "cashback"], category: "Reembolso", type: "income" },

      // Renda Extra
      { terms: ["venda", "aluguel recebido", "lucro", "dividendo", "rendimento", "jcp"], category: "Renda Extra", type: "income" },
    ];
  }

  classify(description, value) {
    const lowerDesc = description.toLowerCase();

    // 1. Keyword Scoring
    let bestMatch = null;
    let maxScore = 0;

    for (const set of this.dataset) {
      for (const term of set.terms) {
        if (lowerDesc.includes(term)) {
          // Score by length to prioritize more specific matches
          const score = term.length;
          if (score > maxScore) {
            maxScore = score;
            bestMatch = set;
          }
        }
      }
    }

    // 2. Final Decision
    if (bestMatch) {
      return { category: bestMatch.category, type: bestMatch.type };
    }

    // 3. Fallback Heuristics if no keyword matched
    let isIncome = false;

    // Explicit Income Keywords (Override logic)
    const incomeKeywords = ["salário", "recebido", "depósito recebido", "transferência recebida", "pix recebido", "resgate", "rendimento", "reembolso", "estorno", "cashback"];

    if (incomeKeywords.some(term => lowerDesc.includes(term))) {
      isIncome = true;
    } else if (value > 0) {
      // Heuristic: If positive value and no keywords, assume income.
      // Note: This is weak if the user pastes expenses as positive numbers (which is common).
      // But without keywords, we can't be sure.
      // If the user pastes "Compra X 100", and 100 is positive, and "Compra X" matches nothing...
      // We might assume it's "Outros Recebimentos". This might be wrong.
      // However, usually "Expenses" have keywords like "Supermercado", etc.
      // Let's stick to the original heuristic but return proper type.
      isIncome = true;
    }

    if (isIncome) {
      return { category: "Outros Recebimentos", type: "income" };
    } else {
      return { category: "Outros Gastos", type: "expense" };
    }
  }
}

const classifier = new SmartClassifier();

function inferCategory(description, value) {
  return classifier.classify(description, value);
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

  expenses.forEach((expense, index) => {
    const row = document.createElement("tr");
    const amountClass = expense.value < 0 ? "text-danger" : "text-success";

    row.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.description}</td>
      <td><span class="badge text-bg-secondary">${expense.category}</span></td>
      <td class="text-end ${amountClass}">${formatCurrency(expense.value)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger delete-btn" data-index="${index}" title="Remover item">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47ZM8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/>
          </svg>
        </button>
      </td>
    `;
    expensesTableBody.appendChild(row);
  });

  // Attach event listeners to delete buttons
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      deleteExpense(index);
    });
  });

  const total = expenses.reduce((sum, expense) => sum + expense.value, 0);
  totalValue.textContent = `Total: ${formatCurrency(total)}`;

  renderChart();
}

function deleteExpense(index) {
  if (index < 0 || index >= expenses.length) return;
  expenses.splice(index, 1);
  saveExpenses();
  renderTable();
  showToast("Item removido.", "success");
}

function generateCSV() {
  let csv = "Data,Descrição,Categoria,Tipo,Valor\n";
  expenses.forEach((item) => {
    const desc = `"${item.description.replace(/"/g, '""')}"`;
    const type = item.type === 'income' ? "Receita" : "Despesa";
    // Standard CSV format
    csv += `${item.date},${desc},${item.category},${type},${item.value.toFixed(2)}\n`;
  });
  return csv;
}

function downloadCSV(csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "meus_gastos.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    let parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // Migration: Ensure types and correct signs
    parsed = parsed.map(expense => {
      let type = expense.type;

      // Infer type if missing
      if (!type) {
        const match = classifier.dataset.find(d => d.category === expense.category);
        if (match) {
          type = match.type;
        } else {
          // Fallback based on category names or value
          if (expense.category === "Outros Recebimentos" || expense.category === "Salário") {
            type = "income";
          } else {
            type = "expense";
          }
        }
      }

      let value = expense.value;
      // Enforce sign based on type
      if (type === 'expense') {
        value = -Math.abs(value);
      } else if (type === 'income') {
        value = Math.abs(value);
      }

      return { ...expense, type, value };
    });

    return parsed;
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

let chartInstance = null;

function renderChart() {
  const ctx = document.getElementById("expensesChart");
  if (!ctx) return;

  // Filter expenses only
  const expenseItems = expenses.filter(e => e.type === 'expense');

  // Aggregate by category
  const categoryTotals = {};
  expenseItems.forEach(item => {
    const cat = item.category || "Outros";
    const val = Math.abs(item.value);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + val;
  });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  // Simple palette
  const backgroundColors = [
    "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40",
    "#E7E9ED", "#76D7C4", "#F7DC6F", "#F1948A", "#85C1E9", "#BB8FCE",
    "#5D6D7E", "#58D68D", "#F5B041", "#DC7633", "#AF7AC5", "#5DADE2"
  ];

  if (chartInstance) {
    chartInstance.destroy();
  }

  // If no data, we might want to show a message or just empty chart
  if (labels.length === 0) {
    // Optional: Clear canvas or show placeholder
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
        },
        title: {
          display: true,
          text: 'Distribuição de Gastos'
        }
      }
    }
  });
}

// Initial Load
let expenses = loadExpenses();
renderTable();
