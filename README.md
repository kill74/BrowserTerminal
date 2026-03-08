# WebTerm — A Retro Web Terminal

> A terminal that lives in your browser. Browse websites, search the web, and fetch raw HTML — all through a command-line interface. No cloud AI required — this runs fully local with Ollama.

---

## 🇬🇧 English

### What is this?

WebTerm is a fake (but very real) terminal that you run in your browser. You type commands like `browse youtube.com` or `search best pizza near me`, and it loads the result right there in the terminal — either as raw text or as a live embedded browser window.

It also supports a local AI through **Ollama**, which means everything runs on your own machine. No Google account, no API keys, no monthly bills, no data being sent to the cloud.

---

### What you need before starting

- **Node.js** — version 18 or higher. Download it at https://nodejs.org  
- **Ollama** — the app that lets you run AI models locally. Download it at https://ollama.com  
- A model pulled into Ollama (we recommend `llama3` or `mistral` — more on that below)

---

### Step 1 — Install Ollama and pull a model

After installing Ollama, open your terminal and run:

```bash
ollama pull llama3
```

This downloads the Llama 3 model to your computer. It's about 4–5 GB, so give it a few minutes. You only need to do this once.

If you prefer a lighter model (runs faster on older machines), try:

```bash
ollama pull mistral
```

Once it's done, start Ollama so it's running in the background:

```bash
ollama serve
```

> **Note:** On macOS and Windows, Ollama starts automatically when you install it. You probably don't need to run `ollama serve` manually.

---

### Step 2 — Set up the project

Clone or download this project to your machine, then open the folder in your terminal.

Install the dependencies:

```bash
npm install
```

Now create a file called `.env.local` in the root of the project (same folder as `package.json`). Open it and add this:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

If you chose `mistral` instead, write `mistral` on the second line. That's it.

---

### Step 3 — Run the app

```bash
npm run dev
```

Open your browser and go to **http://localhost:3000**

You should see the terminal. Type `help` to see what commands are available.

---

### Commands you can use

| Command | What it does |
|---|---|
| `help` | Shows the list of commands |
| `clear` | Clears the screen |
| `browse <url>` | Opens a website inside the terminal |
| `search <query>` | Searches the web with DuckDuckGo |
| `curl <url>` | Fetches the raw HTML of a page |
| `echo <text>` | Prints text on the screen |
| `date` | Shows the current date and time |

**Tip:** If you click a link inside the embedded browser, it automatically runs a new `browse` command for that page. You never need to leave the terminal.

---

### Troubleshooting

**The app starts but Ollama doesn't respond**  
Make sure Ollama is running. Open a separate terminal and run `ollama serve`. Then try again.

**I get an error about a missing model**  
Run `ollama pull llama3` (or whatever model you put in `.env.local`) and wait for it to finish.

**The browser window inside the terminal shows a blank page or an error**  
Some websites actively block being embedded in iframes. This is a limitation of those sites, not a bug in WebTerm. Try a different site.

**Port 3000 is already in use**  
Open `server.ts` and change `const PORT = 3000` to another number, like `3001`. Then restart.

---

### How to build for production

If you want to deploy this somewhere (a server, a VPS, etc.):

```bash
npm run build
npm run start
```

This builds the frontend into the `dist/` folder and starts the Express server.

---

&nbsp;

---

## 🇵🇹 Português (Portugal)

### O que é isto?

O WebTerm é um terminal falso (mas muito real) que corre no teu browser. Escreves comandos como `browse youtube.com` ou `search melhor pizza perto de mim`, e o resultado aparece mesmo ali no terminal — seja como texto simples ou como uma janela de browser embutida.

Também suporta uma IA local através do **Ollama**, o que significa que tudo corre na tua própria máquina. Sem conta Google, sem API keys, sem mensalidades, sem dados a ir para a cloud.

---

### O que precisas antes de começar

- **Node.js** — versão 18 ou superior. Descarrega em https://nodejs.org  
- **Ollama** — a aplicação que te permite correr modelos de IA localmente. Descarrega em https://ollama.com  
- Um modelo descarregado no Ollama (recomendamos `llama3` ou `mistral` — mais detalhes abaixo)

---

### Passo 1 — Instalar o Ollama e descarregar um modelo

Depois de instalar o Ollama, abre o terminal e escreve:

```bash
ollama pull llama3
```

Isto descarrega o modelo Llama 3 para o teu computador. São cerca de 4–5 GB, por isso dá-lhe uns minutos. Só precisas de fazer isto uma vez.

Se preferires um modelo mais leve (mais rápido em máquinas mais antigas), experimenta:

```bash
ollama pull mistral
```

Quando terminar, inicia o Ollama para que fique a correr em segundo plano:

```bash
ollama serve
```

> **Nota:** No macOS e no Windows, o Ollama inicia automaticamente após a instalação. Provavelmente não precisas de correr `ollama serve` manualmente.

---

### Passo 2 — Configurar o projeto

Clona ou descarrega este projeto para a tua máquina e abre a pasta no terminal.

Instala as dependências:

```bash
npm install
```

Agora cria um ficheiro chamado `.env.local` na raiz do projeto (a mesma pasta onde está o `package.json`). Abre-o e adiciona isto:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Se escolheste `mistral`, escreve `mistral` na segunda linha. É tudo.

---

### Passo 3 — Correr a aplicação

```bash
npm run dev
```

Abre o browser e vai a **http://localhost:3000**

Deves ver o terminal. Escreve `help` para veres os comandos disponíveis.

---

### Comandos disponíveis

| Comando | O que faz |
|---|---|
| `help` | Mostra a lista de comandos |
| `clear` | Limpa o ecrã |
| `browse <url>` | Abre um site dentro do terminal |
| `search <pesquisa>` | Pesquisa na web com DuckDuckGo |
| `curl <url>` | Obtém o HTML bruto de uma página |
| `echo <texto>` | Imprime texto no ecrã |
| `date` | Mostra a data e hora atual |

**Dica:** Se clicares num link dentro do browser embutido, ele corre automaticamente um novo comando `browse` para essa página. Nunca precisas de sair do terminal.

---

### Resolução de problemas

**A app inicia mas o Ollama não responde**  
Certifica-te de que o Ollama está a correr. Abre um terminal separado e corre `ollama serve`. Depois tenta novamente.

**Recebo um erro sobre um modelo em falta**  
Corre `ollama pull llama3` (ou o modelo que puseste no `.env.local`) e espera que termine.

**A janela do browser dentro do terminal aparece em branco ou dá erro**  
Alguns sites bloqueiam ativamente o carregamento em iframes. Isto é uma limitação desses sites, não um bug do WebTerm. Experimenta um site diferente.

**A porta 3000 já está em uso**  
Abre o ficheiro `server.ts` e muda `const PORT = 3000` para outro número, por exemplo `3001`. Depois reinicia.

---

### Como compilar para produção

Se quiseres fazer deploy nalgum servidor:

```bash
npm run build
npm run start
```

Isto compila o frontend para a pasta `dist/` e inicia o servidor Express.

---

*Feito com ❤️ — corre tudo local, os teus dados ficam contigo.*
