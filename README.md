# 🖥️ WebTerm v2.0 - O Teu Terminal Web Inteligente

Bem-vindo ao **WebTerm**! Se gostas da eficiência da linha de comandos mas não queres abdicar das funcionalidades do browser moderno, este projeto é para ti. É um terminal completo que corre diretamente no teu navegador, permitindo-te navegar na web, ver vídeos, ouvir música e até falar com IAs locais, tudo sem tirar as mãos do teclado.

---

## 🚀 Como Começar

Basta clicares no terminal e começares a escrever. Se te sentires perdido, escreve `help` e prime **Enter**.

### Atalhos de Teclado Úteis:
*   **`Tab`**: Completa automaticamente os comandos (podes premir várias vezes para alternar entre opções).
*   **`Setas Cima/Baixo`**: Navega pelo histórico de comandos que já escreveste.
*   **`Ctrl + R`**: Pesquisa reversa no histórico (escreve uma parte de um comando antigo para o encontrares num instante).
*   **`Enter`**: Executa o comando.

---

## 🛠️ Comandos Disponíveis

Aqui tens a lista de tudo o que podes fazer:

### 🌐 Navegação e Pesquisa
*   **`search <texto>`**: Pesquisa na web usando o motor de busca selecionado.
*   **`engine <nome>`**: Muda o motor de busca (ex: `engine google`, `engine ddg`, `engine brave`).
*   **`browse <url>`**: Abre um site diretamente dentro do terminal. Podes clicar nos links dentro do site e o terminal vai acompanhar a tua navegação!
*   **`curl <url>`**: Mostra o código HTML puro de uma página (útil para programadores).

### 📺 Multimédia
*   **`youtube <pesquisa>`**: Procura vídeos no YouTube usando um "espelho" (mirror) focado em privacidade.
*   **`watch <url ou ID>`**: Vê um vídeo do YouTube diretamente na consola.
*   **`mirror next`**: Se um vídeo não carregar, usa este comando para saltar para outro servidor do YouTube.
*   **`twitch <canal>`**: Vê um stream da Twitch em direto (ex: `twitch gaules`).
*   **`download <url>`**: Converte e descarrega um vídeo do YouTube para formato MP3.

### 🤖 Inteligência Artificial (Ollama)
*   **`ai <pergunta>`**: Fala com a tua IA local (precisas de ter o Ollama a correr no teu PC).
*   **`ollama status`**: Vê se o terminal consegue ligar-se ao teu Ollama e que modelos tens instalados.
*   **`ollama model <nome>`**: Muda o modelo da IA (ex: `ollama model llama3`).

### 🎨 Personalização
*   **`theme <modo>`**: Muda o visual (ex: `theme light`, `theme matrix`, `theme cyberpunk`).
*   **`css <estilos>`**: Se souberes um pouco de CSS, podes injetar estilos personalizados. Usa `css clear` para resetar.

### 📂 Utilitários
*   **`help`**: Mostra a ajuda.
*   **`clear`**: Limpa o ecrã.
*   **`date`**: Mostra a hora e data atual.
*   **`echo <texto>`**: Repete o que escreveste.
*   **`cd <pasta>`**: Muda de diretório (apenas visual, para te sentires em casa).

---

## 🛰️ A Barra de Estado (Status Bar)

Na parte inferior, tens sempre informações em tempo real:
*   **DIR**: A pasta onde "estás".
*   **STATUS**: Indica se estás online ou offline.
*   **JOBS**: Mostra se há processos a correr em fundo (como um download).
*   **ENGINE**: O motor de busca ativo.
*   **THEME**: O tema atual.

---

## 💡 Notas Importantes sobre o Ollama

Para usares o comando `ai`, o teu Ollama local precisa de aceitar pedidos deste site. 
No teu computador, fecha o Ollama e reinicia-o com este comando no terminal/PowerShell:

**Windows:**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

**Mac/Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

Se continuares com erros de ligação, clica no **cadeado** na barra de endereço do browser -> **Definições do site** -> e permite **Conteúdo inseguro** (isto é necessário porque o Ollama corre em HTTP local e este site usa HTTPS).

---

Feito com ❤️ para quem vive no terminal.
