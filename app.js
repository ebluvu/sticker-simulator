const THEMES = {
  sunrise: {
    label: "晨曦",
    phoneBg: "#2B303F",
    chatBg: ["rgba(255, 227, 175, 0.4)", "rgba(255, 255, 255, 0)"],
    receiveBubble: "rgba(255, 255, 255, 0.85)",
    receiveText: "#2f2000",
    sendBubble: "#ffe069",
    sendText: "#2f2000",
    time: "rgba(255, 255, 255, 0.65)"
  },
  midnight: {
    label: "午夜",
    phoneBg: "#2B303F",
    chatBg: ["rgba(8, 12, 24, 0.65)", "rgba(8, 12, 24, 0.25)"],
    receiveBubble: "rgba(17, 32, 56, 0.9)",
    receiveText: "#f5f5f6",
    sendBubble: ["#5cf0c3", "#2d80ff"],
    sendText: "#031819",
    time: "rgba(255, 255, 255, 0.65)"
  },
  mint: {
    label: "薄荷",
    phoneBg: "#2B303F",
    chatBg: ["rgba(220, 255, 245, 0.5)", "rgba(255, 255, 255, 0.3)"],
    receiveBubble: "rgba(255, 255, 255, 0.95)",
    receiveText: "#013049",
    sendBubble: ["#7efff5", "#4facfe"],
    sendText: "#013049",
    time: "rgba(255, 255, 255, 0.65)"
  }
};

const UID = (() => {
  let seed = 0;
  return () => `m-${Date.now().toString(36)}-${(seed++).toString(36)}`;
})();

const formatTime = (date = new Date()) => {
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
};

const hasFiles = event =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const filterImageFiles = fileList =>
  Array.from(fileList).filter(file => /^image\//.test(file.type));

const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

class StickerSandbox {
  constructor(root) {
    this.root = root;
    this.state = {
      theme: "sunrise",
      author: "send",
      messages: [],
      stickerPacks: [],
      activePackId: null
    };
    this.templates = {
      message: document
        .getElementById("message-template")
        .content.querySelector("li"),
      sticker: document
        .getElementById("sticker-thumb-template")
        .content.querySelector("button"),
      stickerTab: document
        .getElementById("sticker-tab-template")
        .content.querySelector("button")
    };
    this.cacheDom();
    this.bindEvents();
    this.loadDefaultStickers().then(() => {
      this.updateAddArea();
      this.renderTabs();
      this.renderStickers();
      this.updateLayout();
    });
    this.updateSendButton(); // 初始化按鈕狀態
  }

  cacheDom() {
    this.phone = this.root.querySelector(".phone");
    this.themeButtons = this.root.querySelectorAll(".theme-circle");
    this.authorButtons = this.root.querySelectorAll(".author-toggle");
    this.messageInput = this.root.querySelector("#message-input");
    this.statusTimeEl = this.root.querySelector("#status-time");
    this.menuToggle = this.root.querySelector(".chat-header__btn.more");
    this.headerMenu = this.root.querySelector("#header-menu");
    this.emojiButton = this.root.querySelector('[data-toggle="stickers"]');
    this.stickerDrawer = this.root.querySelector(".sticker-drawer");
    this.chatList = this.root.querySelector("#chat-list");
    this.emptyState = this.root.querySelector("#empty-state");
    this.chatScroll = this.root.querySelector("#chat-scroll");
    this.stickerGrid = this.root.querySelector("#sticker-grid");
    this.stickerTabs = this.root.querySelector("#sticker-tabs");
    this.stickerInput = this.root.querySelector("#sticker-input");
    this.sendFloat = this.root.querySelector("#send-float");
    this.stickerAddFloat = this.root.querySelector("#sticker-add-float");
    this.packAddButton = this.root.querySelector('[data-action="add-pack"]');
  }

  bindEvents() {
    this.themeButtons.forEach(button => {
      button.addEventListener("click", () => {
        this.state.theme = button.dataset.theme;
        this.phone.dataset.theme = this.state.theme;
        this.themeButtons.forEach(btn =>
          btn.classList.toggle("is-active", btn === button)
        );
        this.headerMenu.classList.remove("is-open");
        this.menuToggle.setAttribute("aria-expanded", "false");
      });
    });

    this.authorButtons.forEach(button => {
      button.addEventListener("click", () => {
        this.state.author = button.dataset.author;
        this.authorButtons.forEach(btn =>
          btn.classList.toggle("is-active", btn === button)
        );
      });
    });

    this.messageInput.addEventListener("keydown", event => {
      // 移除 Enter 鍵的送出功能，讓 Enter 鍵在所有設備上都用於換行
      // 用戶可以通過點擊發送按鈕來送出訊息
    });

    // 自動調整 textarea 高度
    this.messageInput.addEventListener("input", () => {
      this.autoResizeTextarea();
      this.updateSendButton();
    });

    // 傳送按鈕點擊事件
    this.sendFloat.addEventListener("click", () => {
      this.handleSubmit();
    });

    this.menuToggle.addEventListener("click", event => {
      event.stopPropagation();
      const expanded = this.menuToggle.getAttribute("aria-expanded") === "true";
      this.menuToggle.setAttribute("aria-expanded", (!expanded).toString());
      this.headerMenu.classList.toggle("is-open", !expanded);
    });

    document.addEventListener("click", event => {
      const withinMenu =
        this.headerMenu.contains(event.target) ||
        this.menuToggle.contains(event.target);
      if (!withinMenu) {
        this.headerMenu.classList.remove("is-open");
        this.menuToggle.setAttribute("aria-expanded", "false");
      }
      const withinDrawer =
        this.stickerDrawer.contains(event.target) ||
        this.emojiButton.contains(event.target);
      const isAuthorToggle = event.target.closest(".author-toggle");
      const isMessageInput = event.target === this.messageInput || this.messageInput.contains(event.target);
      if (!withinDrawer && !isAuthorToggle && !isMessageInput) {
        this.emojiButton.setAttribute("aria-expanded", "false");
        this.stickerDrawer.classList.remove("is-open");
        this.updateLayout();
        this.updateEmojiButtonIcon();
      }
    });

    this.headerMenu.querySelectorAll("[data-action]").forEach(button => {
      const action = button.dataset.action;
      if (action === "export") {
        button.addEventListener("click", () => this.exportImage());
      }
      if (action === "clear") {
        button.addEventListener("click", () => this.clearConversation());
      }
    });

    this.emojiButton.addEventListener("click", () => {
      const expanded = this.emojiButton.getAttribute("aria-expanded") === "true";
      const nextState = !expanded;
      this.emojiButton.setAttribute("aria-expanded", nextState.toString());
      this.stickerDrawer.classList.toggle("is-open", nextState);
      this.updateLayout();
      this.updateEmojiButtonIcon();
      if (nextState) {
        // 開啟視窗時，等待布局更新後再滾動，與視窗展開動畫同步（0.3s）
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.scrollToBottom(300);
          });
        });
      }
    });

    this.packAddButton.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.multiple = false;
      fileInput.addEventListener("change", event => {
        const files = filterImageFiles(event.target.files);
        if (files.length) {
          this.createPack(files[0]);
        }
      });
      fileInput.click();
    });

    this.stickerAddFloat.addEventListener("click", () => this.stickerInput.click());
    this.stickerInput.addEventListener("change", event => {
      if (!this.state.activePackId) return;
      const files = filterImageFiles(event.target.files);
      if (files.length) {
        this.addStickersToPack(this.state.activePackId, files);
      }
      this.stickerInput.value = "";
    });

    const stickerTabsArea = this.stickerDrawer.querySelector(".sticker-drawer__tabs");
    const stickerGridArea = this.stickerDrawer.querySelector(".sticker-drawer__grid");

    ["dragenter", "dragover"].forEach(eventType => {
      stickerTabsArea.addEventListener(eventType, event => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        stickerTabsArea.classList.add("is-drop-target");
      });
      stickerGridArea.addEventListener(eventType, event => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        stickerGridArea.classList.add("is-drop-target");
      });
    });

    ["dragleave", "drop"].forEach(eventType => {
      stickerTabsArea.addEventListener(eventType, () =>
        stickerTabsArea.classList.remove("is-drop-target")
      );
      stickerGridArea.addEventListener(eventType, () =>
        stickerGridArea.classList.remove("is-drop-target")
      );
    });

    stickerTabsArea.addEventListener("drop", event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const files = filterImageFiles(event.dataTransfer.files);
      stickerTabsArea.classList.remove("is-drop-target");
      if (files.length === 1) {
        this.createPack(files[0]);
      }
    });

    stickerGridArea.addEventListener("drop", event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const files = filterImageFiles(event.dataTransfer.files);
      stickerGridArea.classList.remove("is-drop-target");
      if (this.state.activePackId && files.length) {
        this.addStickersToPack(this.state.activePackId, files);
      }
    });

    ["dragenter", "dragover"].forEach(eventType => {
      this.chatScroll.addEventListener(eventType, event => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
      });
    });
    this.chatScroll.addEventListener("drop", event => this.handleChatDrop(event));

    this.setStatusTime();
  }

  handleSubmit() {
    const text = this.messageInput.value.trim();
    if (!text) return;
    this.appendMessage({
      id: UID(),
      author: this.state.author,
      type: "text",
      text,
      createdAt: new Date(),
      timeLabel: formatTime()
    });
    this.messageInput.value = "";
    this.autoResizeTextarea();
    this.updateSendButton();
  }

  updateSendButton() {
    const hasText = this.messageInput.value.trim().length > 0;
    if (hasText) {
      this.sendFloat.style.display = "flex";
    } else {
      this.sendFloat.style.display = "none";
    }
  }

  autoResizeTextarea() {
    const textarea = this.messageInput;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = parseFloat(getComputedStyle(textarea).maxHeight);
    
    if (scrollHeight <= maxHeight) {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = "hidden";
    } else {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = "auto";
    }
  }

  updateEmojiButtonIcon() {
    const isOpen = this.emojiButton.getAttribute("aria-expanded") === "true";
    this.emojiButton.textContent = isOpen ? "⌨️" : "🙂";
  }

  handleChatDrop(event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    const files = filterImageFiles(event.dataTransfer.files);
    if (!files.length) return;
    const rect = this.chatScroll.getBoundingClientRect();
    const author =
      event.clientX - rect.left < rect.width / 2 ? "receive" : "send";
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      this.appendMessage({
        id: UID(),
        author,
        type: "sticker",
        src: url,
        createdAt: new Date(),
        timeLabel: formatTime()
      });
    });
  }

  appendMessage(message) {
    this.state.messages.push(message);
    this.renderMessages();
    this.scrollToBottom();
  }

  renderMessages() {
    this.chatList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    this.state.messages.forEach(message => {
      const node = this.templates.message.cloneNode(true);
      node.dataset.author = message.author;
      const body = node.querySelector(".bubble__body");
      const textNode = node.querySelector(".bubble__text");
      const stickerFigure = node.querySelector(".bubble__sticker");
      const stickerImg = stickerFigure.querySelector("img");
      const timeNode = node.querySelector(".bubble__time");
      const isSticker = message.type === "sticker";
      body.classList.toggle("is-sticker", isSticker);
      if (isSticker) {
        stickerImg.src = message.src;
        stickerFigure.hidden = false;
        textNode.hidden = true;
      } else {
        // 保留換行符，將 \n 轉換為 <br>
        textNode.innerHTML = message.text.replace(/\n/g, '<br>');
        textNode.hidden = false;
        stickerFigure.hidden = true;
      }
      timeNode.textContent = message.timeLabel;
      fragment.appendChild(node);
    });
    this.chatList.appendChild(fragment);
    this.emptyState.style.display = this.state.messages.length ? "none" : "grid";
  }

  scrollToBottom(duration = 300) {
    // 確保在當前幀計算目標位置，因為 padding 可能剛改變
    const start = this.chatScroll.scrollTop;
    const maxScroll = this.chatScroll.scrollHeight - this.chatScroll.clientHeight;
    const target = Math.max(0, maxScroll);
    const distance = target - start;
    
    if (Math.abs(distance) < 1) return; // 已經在底部，不需要滾動
    
    const startTime = performance.now();

    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = (t) => t * (2 - t); // ease-out
      const currentScroll = start + distance * ease(progress);
      this.chatScroll.scrollTop = currentScroll;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      } else {
        // 動畫結束後，確保滾動到最底部（處理動態內容變化）
        this.chatScroll.scrollTop = this.chatScroll.scrollHeight;
      }
    };

    requestAnimationFrame(animateScroll);
  }

  createPack(thumbnailFile) {
    const thumbnailUrl = URL.createObjectURL(thumbnailFile);
    const pack = {
      id: UID(),
      thumbnail: thumbnailUrl,
      stickers: []
    };
    this.state.stickerPacks.push(pack);
    this.state.activePackId = pack.id;
    this.renderTabs();
    this.renderStickers();
    this.updateAddArea();
  }

  addStickersToPack(packId, files) {
    const pack = this.state.stickerPacks.find(p => p.id === packId);
    if (!pack) return;
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const sticker = { id: UID(), url, name: file.name };
      pack.stickers.push(sticker);
    });
    this.renderStickers();
  }

  async loadDefaultStickers() {
    try {
      // 使用 Image 對象載入圖片，避免 file:// 協議的 CORS 問題
      const loadImage = (src) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      };

      // 載入貼圖包圖示
      const tabUrl = './assets/tab.png';
      await loadImage(tabUrl);

      // 載入所有貼圖 (01~08.png)
      const stickerUrls = [];
      for (let i = 1; i <= 8; i++) {
        const num = i.toString().padStart(2, '0');
        const url = `./assets/${num}.png`;
        try {
          await loadImage(url);
          stickerUrls.push(url);
        } catch (error) {
          console.warn(`無法載入 ${num}.png:`, error);
        }
      }

      if (stickerUrls.length === 0) {
        console.warn('沒有成功載入任何預設貼圖');
        return;
      }

      // 創建預設貼圖包（直接使用相對路徑 URL）
      const defaultPack = {
        id: UID(),
        thumbnail: tabUrl,
        stickers: stickerUrls.map((url, index) => ({
          id: UID(),
          url: url,
          name: `${(index + 1).toString().padStart(2, '0')}.png`
        }))
      };

      this.state.stickerPacks.push(defaultPack);
      this.state.activePackId = defaultPack.id;
    } catch (error) {
      console.error('無法載入預設貼圖:', error);
    }
  }

  selectPack(packId) {
    this.state.activePackId = packId;
    this.renderTabs();
    this.renderStickers();
    this.updateAddArea();
  }

  renderTabs() {
    this.stickerTabs.innerHTML = "";
    const fragment = document.createDocumentFragment();
    this.state.stickerPacks.forEach(pack => {
      const tab = this.templates.stickerTab.cloneNode(true);
      const img = tab.querySelector("img");
      img.src = pack.thumbnail;
      img.alt = "貼圖包縮圖";
      tab.classList.toggle("is-active", pack.id === this.state.activePackId);
      tab.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectPack(pack.id);
      });
      fragment.appendChild(tab);
    });
    this.stickerTabs.appendChild(fragment);
  }

  renderStickers() {
    if (!this.state.activePackId) {
      this.stickerGrid.dataset.empty = "true";
      this.stickerGrid.innerHTML = "<p>請先選擇或新增貼圖包</p>";
      return;
    }
    const pack = this.state.stickerPacks.find(p => p.id === this.state.activePackId);
    if (!pack || !pack.stickers.length) {
      this.stickerGrid.dataset.empty = "true";
      this.stickerGrid.innerHTML = "<p>此貼圖包尚未加入貼圖</p>";
      return;
    }
    this.stickerGrid.dataset.empty = "false";
    this.stickerGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    pack.stickers.forEach(sticker => {
      const button = this.templates.sticker.cloneNode(true);
      const img = button.querySelector("img");
      img.src = sticker.url;
      img.alt = `${sticker.name ?? "貼圖"} 縮圖`;
      button.addEventListener("click", () =>
        this.appendMessage({
          id: UID(),
          author: this.state.author,
          type: "sticker",
          src: sticker.url,
          createdAt: new Date(),
          timeLabel: formatTime()
        })
      );
      fragment.appendChild(button);
    });
    this.stickerGrid.appendChild(fragment);
  }

  updateAddArea() {
    if (this.state.activePackId) {
      this.stickerAddFloat.style.display = "flex";
    } else {
      this.stickerAddFloat.style.display = "none";
    }
  }

  updateLayout() {
    const isOpen = this.stickerDrawer.classList.contains("is-open");
    if (isOpen) {
      const drawerHeight = this.stickerDrawer.scrollHeight || Math.round(this.phone.offsetHeight * 0.4);
      this.chatScroll.style.paddingBottom = `${drawerHeight + 12}px`;
    } else {
      this.chatScroll.style.paddingBottom = "";
    }
  }

  setStatusTime() {
    if (this.statusTimeEl) {
      this.statusTimeEl.textContent = formatTime();
    }
  }

  clearConversation() {
    if (!this.state.messages.length) return;
    const confirmed = window.confirm("確定要清除目前的對話嗎？");
    if (!confirmed) return;
    this.state.messages.forEach(message => {
      if (message.type === "sticker" && message.src.startsWith("blob:")) {
        const inPack = this.state.stickerPacks.some(pack =>
          pack.stickers.some(sticker => sticker.url === message.src)
        );
        if (!inPack) {
          URL.revokeObjectURL(message.src);
        }
      }
    });
    this.state.messages = [];
    this.renderMessages();
  }

  async exportImage() {
    if (!this.state.messages.length) {
      alert("沒有訊息可匯出，請先新增內容。");
      return;
    }
    const theme = THEMES[this.state.theme];
    
    // 使用實際的 phone 元素尺寸
    const phoneRect = this.phone.getBoundingClientRect();
    const width = Math.round(phoneRect.width);
    const baseHeight = Math.round(phoneRect.height);
    
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = baseHeight;
    const ctx = canvas.getContext("2d");

    // 手機背景
    ctx.fillStyle = theme.phoneBg;
    ctx.fillRect(0, 0, width, canvas.height);

    // 聊天背景漸變
    const chatGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    chatGradient.addColorStop(0, theme.chatBg[0]);
    chatGradient.addColorStop(1, theme.chatBg[1]);
    ctx.fillStyle = chatGradient;
    ctx.fillRect(0, 0, width, canvas.height);

    let cursorY = 80;
    for (const message of this.state.messages) {
      if (message.type === "text") {
        cursorY = this.drawTextBubble(ctx, message, cursorY, theme, width);
      } else {
        cursorY = await this.drawStickerBubble(ctx, message, cursorY, theme, width);
      }
      cursorY += 12;
    }

    let output = canvas;
    if (cursorY + 80 > canvas.height) {
      output = document.createElement("canvas");
      output.width = width;
      output.height = cursorY + 80;
      const outputCtx = output.getContext("2d");
      // 重新繪製背景
      outputCtx.fillStyle = theme.phoneBg;
      outputCtx.fillRect(0, 0, width, output.height);
      const chatGradient = outputCtx.createLinearGradient(0, 0, 0, output.height);
      chatGradient.addColorStop(0, theme.chatBg[0]);
      chatGradient.addColorStop(1, theme.chatBg[1]);
      outputCtx.fillStyle = chatGradient;
      outputCtx.fillRect(0, 0, width, output.height);
      // 重新繪製所有訊息
      let y = 80;
      for (const message of this.state.messages) {
        if (message.type === "text") {
          y = this.drawTextBubble(outputCtx, message, y, theme, width);
        } else {
          y = await this.drawStickerBubble(outputCtx, message, y, theme, width);
        }
        y += 12;
      }
    }

    output.toBlob(blob => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sticker-sandbox-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  }

  drawTextBubble(ctx, message, startY, theme, width) {
    ctx.font = "14px 'Segoe UI', 'Noto Sans TC', sans-serif";
    const maxWidth = 220 - 28; // 220px max-width - 14px padding * 2
    const lines = this.breakText(ctx, message.text, maxWidth);
    const lineHeight = 14 * 1.5; // font-size * line-height
    const bubbleWidth = Math.min(
      220,
      Math.max(...lines.map(line => ctx.measureText(line).width)) + 28
    ) || 120;
    
    // 計算文字內容高度：每行使用 lineHeight，但最後一行只需要字體高度
    const textContentHeight = lines.length > 1 
      ? (lines.length - 1) * lineHeight + 14
      : 14;
    const bubbleHeight = textContentHeight + 20; // padding 10px * 2
    
    const padding = 8; // 減少 padding，貼齊邊緣
    const avatarSize = 34;
    const avatarGap = 10;
    
    let bubbleX, avatarX;
    if (message.author === "send") {
      // 自己訊息：時間 | 訊息（無頭像）
      bubbleX = width - bubbleWidth - padding;
      ctx.font = "10px 'Segoe UI', 'Noto Sans TC', sans-serif";
      ctx.fillStyle = theme.time;
      ctx.textAlign = "right";
      ctx.fillText(message.timeLabel, bubbleX - 6, startY + bubbleHeight - 6);
      ctx.textAlign = "left";
    } else {
      // 夥伴訊息：頭像 | 訊息 | 時間
      avatarX = padding;
      bubbleX = avatarX + avatarSize + avatarGap;
      // 繪製頭像背景（先繪製）
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, startY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      // 繪製 👤 emoji（後繪製，確保在上方）
      // 先保存狀態，然後確保繪製在上方
      ctx.save();
      // 清除可能影響的狀態
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      // 使用較大的字體確保 emoji 清晰顯示
      ctx.font = "20px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 確保文字顏色不透明
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      // 繪製 emoji
      const emojiX = avatarX + avatarSize / 2;
      const emojiY = startY + avatarSize / 2;
      ctx.fillText("👤", emojiX, emojiY);
      ctx.restore();
      // 時間在右側
      ctx.font = "10px 'Segoe UI', 'Noto Sans TC', sans-serif";
      ctx.fillStyle = theme.time;
      ctx.fillText(message.timeLabel, bubbleX + bubbleWidth + 6, startY + bubbleHeight - 6);
    }
    
    // 繪製訊息泡泡
    ctx.fillStyle = message.author === "send" 
      ? (Array.isArray(theme.sendBubble) 
          ? this.createGradient(ctx, bubbleX, startY, bubbleX + bubbleWidth, startY + bubbleHeight, theme.sendBubble)
          : theme.sendBubble)
      : theme.receiveBubble;
    this.roundRect(ctx, bubbleX, startY, bubbleWidth, bubbleHeight, 18);
    
    // 繪製文字（垂直置中）
    ctx.fillStyle = message.author === "send" ? theme.sendText : theme.receiveText;
    ctx.font = "14px 'Segoe UI', 'Noto Sans TC', sans-serif";
    // 計算文字起始位置：泡泡頂部 + padding + 垂直置中偏移
    // 使用 textBaseline 的 'top' 來精確控制位置
    const textStartY = startY + 10 + (bubbleHeight - 20 - textContentHeight) / 2;
    ctx.textBaseline = "top";
    lines.forEach((line, index) => {
      ctx.fillText(line, bubbleX + 14, textStartY + index * lineHeight);
    });
    ctx.textBaseline = "alphabetic"; // 恢復默認
    
    return startY + Math.max(bubbleHeight, message.author === "receive" ? avatarSize : 0);
  }

  async drawStickerBubble(ctx, message, startY, theme, width) {
    const img = await loadImage(message.src);
    const stickerSize = 160;
    const scale = Math.min(1, stickerSize / Math.max(img.width, img.height));
    const targetWidth = Math.round(img.width * scale);
    const targetHeight = Math.round(img.height * scale);
    const padding = 8; // 減少 padding，貼齊邊緣
    const avatarSize = 34;
    const avatarGap = 10;
    
    let stickerX, avatarX;
    if (message.author === "send") {
      // 自己訊息：時間 | 貼圖（無頭像，無背景）
      stickerX = width - targetWidth - padding;
      ctx.font = "10px 'Segoe UI', 'Noto Sans TC', sans-serif";
      ctx.fillStyle = theme.time;
      ctx.textAlign = "right";
      ctx.fillText(message.timeLabel, stickerX - 6, startY + targetHeight - 6);
      ctx.textAlign = "left";
    } else {
      // 夥伴訊息：頭像 | 貼圖 | 時間（無背景）
      avatarX = padding;
      stickerX = avatarX + avatarSize + avatarGap;
      // 繪製頭像背景（先繪製）
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, startY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      // 繪製 👤 emoji（後繪製，確保在上方）
      // 先保存狀態，然後確保繪製在上方
      ctx.save();
      // 清除可能影響的狀態
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      // 使用較大的字體確保 emoji 清晰顯示
      ctx.font = "20px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 確保文字顏色不透明
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      // 繪製 emoji
      const emojiX = avatarX + avatarSize / 2;
      const emojiY = startY + avatarSize / 2;
      ctx.fillText("👤", emojiX, emojiY);
      ctx.restore();
      // 時間在右側
      ctx.font = "10px 'Segoe UI', 'Noto Sans TC', sans-serif";
      ctx.fillStyle = theme.time;
      ctx.fillText(message.timeLabel, stickerX + targetWidth + 6, startY + targetHeight - 6);
    }
    
    // 繪製貼圖（無背景）
    ctx.drawImage(img, stickerX, startY, targetWidth, targetHeight);
    
    return startY + Math.max(targetHeight, message.author === "receive" ? avatarSize : 0);
  }

  createGradient(ctx, x0, y0, x1, y1, colors) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    if (Array.isArray(colors)) {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);
    }
    return gradient;
  }

  breakText(ctx, text, maxWidth) {
    // 先按換行符分割
    const paragraphs = text.split('\n');
    const lines = [];
    
    for (const para of paragraphs) {
      if (!para) {
        lines.push('');
        continue;
      }
      const chars = Array.from(para);
      let line = "";
      for (const char of chars) {
        const testLine = line + char;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          lines.push(line);
          line = char;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
    }
    
    return lines;
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("app");
  if (root) {
    new StickerSandbox(root);
  }
});

