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
    const { date, value, description, category } = extractFieldsSmart(parts);

    if (!date || !description || isNaN(value)) {
      ignored++;
      return;
    }

    entries.push({
      date,
      description,
      category,
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
  const category = inferCategory(description, value);

  return { date, value, description, category };
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
      // --- DESPESAS ---

      // Viagem por App
      { terms: ["uber", "99", "99pop", "cabify", "indriver"], category: "Viagem por App" },

      // Transporte Público
      { terms: ["ônibus", "metro", "metrô", "trem", "passagem", "bilhete", "cptm", "sptrans", "top"], category: "Transporte Público" },

      // Combustível
      { terms: ["posto", "gasolina", "etanol", "combustível", "ipiranga", "shell", "br", "abastecimento", "petrobras"], category: "Combustível" },

      // Manutenção Veicular
      { terms: ["mecânico", "oficina", "revisão", "pneu", "peças", "troca de óleo", "balanceamento", "funilaria", "bateria"], category: "Manutenção Veicular" },

      // Supermercado
      { terms: ["mercado", "supermercado", "hipermercado", "atacadao", "assai", "carrefour", "pão de açúcar", "dia", "extra", "sonda", "zaffari", "mambo", "tenda", "sams club"], category: "Supermercado" },

      // Alimentação Fora de Casa
      { terms: ["restaurante", "lanchonete", "padaria", "bar", "pub", "cafe", "coffee", "ifood", "rappi", "uber eats", "burger", "mcdonalds", "pizza", "sushi", "açaí", "sorvete", "starbucks", "outback"], category: "Alimentação Fora de Casa" },

      // Streaming e Assinaturas
      { terms: ["netflix", "spotify", "youtube", "amazon prime", "disney", "hbo", "globoplay", "appletv", "paramount", "deezer", "assinatura", "adobe", "google one", "icloud"], category: "Streaming e Assinaturas" },

      // Lazer
      { terms: ["cinema", "ingresso", "show", "teatro", "museu", "parque", "clube", "steam", "playstation", "xbox", "nintendo", "jogo", "game", "sympla", "eventim"], category: "Lazer" },

      // Despesa Fixa (Moradia/Contas)
      { terms: ["aluguel", "condomínio", "luz", "energia", "enel", "light", "cpfl", "água", "sabesp", "gás", "iptu", "net", "vivo", "claro", "tim", "internet", "oi", "celular", "conta", "mensalidade"], category: "Despesa Fixa" },

      // Manutenção Residencial
      { terms: ["leroy", "telhanorte", "manutenção", "conserto", "eletricista", "encanador", "limpeza", "faxina", "diarista", "c&c", "sodimac", "casa e construção"], category: "Manutenção Residencial" },

      // Saúde
      { terms: ["farmácia", "drogaria", "drogasil", "raia", "pague menos", "ultrafarma", "medicamento", "remédio", "médico", "consulta", "exame", "laboratório", "hospital", "dentista", "ortodontista", "psicólogo", "terapia", "plano de saúde", "unimed", "sulamerica", "bradesco saude"], category: "Saúde" },

      // Educação
      { terms: ["escola", "colégio", "faculdade", "universidade", "curso", "udemy", "alura", "coursera", "livro", "saraiva", "amazon", "papelaria", "material escolar", "idiomas", "inglês"], category: "Educação" },

      // Vestuário
      { terms: ["roupa", "vestuário", "sapato", "tênis", "camisa", "calça", "zara", "renner", "c&a", "riachuelo", "shein", "privalia", "dafiti", "nike", "adidas", "centauro"], category: "Vestuário" },

      // Seguros
      { terms: ["seguro", "porto seguro", "azul seguros", "tokio marine", "allianz", "liberty", "suhai"], category: "Seguros" },

      // Serviços Profissionais
      { terms: ["advogado", "contador", "consultoria", "cartório", "despachante"], category: "Serviços Profissionais" },

      // Impostos e Taxas
      { terms: ["iof", "tarifa", "anuidade", "juros", "taxa", "multa", "darf", "das", "irpf"], category: "Impostos e Taxas" },

      // Cartão de Crédito (Pagamento da fatura)
      { terms: ["fatura", "cartão", "card", "visa", "mastercard", "amex", "nubank", "inter"], category: "Cartão de Crédito" },

      // Compras Parceladas (Generic keyword match for installments if descriptive text implies it)
      { terms: ["parcela", "1/", "2/", "3/", "4/", "5/", "6/", "7/", "8/", "9/", "10/", "11/", "12/"], category: "Compras Parceladas" },

      // --- RECEITAS ---

      // Salário
      { terms: ["salário", "holerite", "proventos", "folha"], category: "Salário" },

      // Freelance
      { terms: ["freela", "serviço prestado", "job", "projeto"], category: "Freelance" },

      // Reembolso
      { terms: ["reembolso", "estorno", "devolução", "cashback"], category: "Reembolso" },

      // Renda Extra
      { terms: ["venda", "aluguel recebido", "lucro", "dividendo", "rendimento", "jcp"], category: "Renda Extra" },
    ];
  }

  classify(description, value) {
    const lowerDesc = description.toLowerCase();

    // 1. Identify Income vs Expense based on Value Sign or Strong Keywords
    // Note: Some exports show expenses as positive. We use heuristics.

    let isIncome = false;

    // Explicit Income Keywords (Override logic)
    const incomeKeywords = ["salário", "recebido", "depósito recebido", "transferência recebida", "pix recebido", "resgate", "rendimento", "reembolso", "estorno", "cashback"];
    if (incomeKeywords.some(term => lowerDesc.includes(term))) {
      isIncome = true;
    } else if (value > 0) {
      // Heuristic: If valid positive number and not an obvious debt payment or installament reversal, assume Income.
      // But be careful: "Estorno de compra" is positive (Income/Refund).
      // "Pagamento Fatura" is negative.
      // If the user pasted negative numbers for expenses, then Positive = Income.
      isIncome = true;
    }

    // 2. Keyword Scoring for Expenses
    let bestCategory = null;
    let maxScore = 0;

    for (const set of this.dataset) {
      for (const term of set.terms) {
        if (lowerDesc.includes(term)) {
          // Avoid matching short terms inside other words (e.g. "oi" in "boi")
          // Simple hack: check boundaries if term is short
          // For now, simple includes. Score by length.
          const score = term.length;
          if (score > maxScore) {
            maxScore = score;
            bestCategory = set.category;
          }
        }
      }
    }

    // 3. Final Decision
    if (bestCategory) {
      return bestCategory;
    }

    // 4. Fallback
    if (isIncome) {
      return "Outros Recebimentos";
    } else {
      return "Outros Gastos";
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
