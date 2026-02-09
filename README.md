# 📊 Organizador de Gastos Pessoais com IA

> Um analisador inteligente de despesas que roda 100% no seu navegador. Sem servidores, sem mensalidade, com privacidade total.

[![Live Demo](https://img.shields.io/badge/Acessar_Aplicação-00C853?style=for-the-badge&logo=github&logoColor=white)](https://danielmurilo.github.io/Exemplo-IA/)

Este projeto é uma ferramenta simples e poderosa para **organizar suas finanças a partir de dados brutos**. Se você costuma copiar extratos bancários ou planilhas desorganizadas (Excel, Google Sheets), esta ferramenta utiliza inteligência artificial client-side para categorizar seus gastos automaticamente.

![Preview](screenshot.png) *(Adicione uma screenshot do projeto aqui)*

---

## ✨ Funcionalidades

### 🧠 Inteligência Artificial Local (Client-Side)
Diferente de outros apps, nossa "IA" é um classificador Bayesiano otimizado que roda diretamente no seu JavaScript.
- **Auto-Categorização:** Reconhece dezenas de estabelecimentos (Uber, iFood, Netflix, Mercados) e atribui a categoria correta.
- **Detecção de Receitas:** Identifica automaticamente entradas como Salário, Reembolsos e Pix recebidos.
- **Privacidade Absoluta:** Seus dados financeiros **nunca** saem do seu computador.

### 📋 Processamento de Dados Brutos
Cole qualquer texto bagunçado da sua área de transferência:
- Suporte a colunas separadas por **TAB** (Excel), **Ponto e Vírgula** (CSV) ou outros formatos.
- **Detecção Inteligente de Colunas**: Não importa a ordem (Data/Valor/Descrição), o sistema entende.
- **Datas Flexíveis**: Aceita formatos como `02/02` (adiciona ano atual) ou `02/02/2024`.
- **Descrição Aglutinadora**: Junta informações extras (como "Banco", "Obs") na descrição para você não perder detalhes.

### 🍱 Categorias Otimizadas
O sistema utiliza um padrão financeiro robusto:
- **Despesas**: Alimentação Fora de Casa, Supermercado, Transporte (App/Público/Combustível), Moradia, Saúde, Lazer, Streaming, etc.
- **Receitas**: Salário, Freelance, Reembolso, Renda Extra.

---

## 🚀 Como Usar

1. Acesse o [link do projeto](https://danielmurilo.github.io/Exemplo-IA/).
2. Copie os dados da sua planilha ou extrato bancário (Ctrl+C).
3. Cole na caixa de texto da aplicação (Ctrl+V).
4. Clique em **Processar**.
5. ✨ A mágica acontece! Seus dados aparecem organizados na tabela.

---

## 🛠️ Tecnologias

- **HTML5 & CSS3** (Bootstrap 5)
- **JavaScript (ES6+)**
- **LocalStorage API** (Para salvar seus dados no navegador)
- **Client-Side AI** (Lógica de classificação customizada)

---

## 📄 Licença

Este projeto é open-source. Sinta-se à vontade para usar, estudar e modificar.

---
Desenvolvido por [Daniel Murilo](https://github.com/danielmurilo)
