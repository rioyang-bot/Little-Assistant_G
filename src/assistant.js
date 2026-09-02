// ==========================================================================
// Assistant Features: Audio, Dragging, Pomodoro, To-Do, AI Dialogue
// ==========================================================================

export class AssistantController {
  constructor(ballRenderer) {
    this.ballRenderer = ballRenderer;
    this.container = document.getElementById('assistant-container');
    this.character = document.getElementById('bear-character');
    this.speechBubble = document.getElementById('speech-bubble');
    this.speechText = document.getElementById('speech-text');

    // State
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialLeft = 0;
    this.initialTop = 0;
    this.quotesEnabled = true;

    // Audio context for ambient sounds & chimes
    this.audioCtx = null;
    this.activeNoiseNode = null;
    this.currentSoundType = 'none';
    this.soundVolume = 0.45;

    // Pomodoro Timer State
    this.pomoDuration = 25 * 60;
    this.pomoTimeRemaining = this.pomoDuration;
    this.pomoInterval = null;
    this.pomoRunning = false;
    this.pomoMode = 25; // 25 min or 50 min or 5 min break

    this.init();
  }

  init() {
    this.initDraggable();
    this.initClock();
    this.initSpeechSystem();
    this.initPomodoro();
    this.initTodoList();
    this.initSoundSynthesizer();
    this.initAIChat();
  }

  // 1. Draggable Window / Assistant
  initDraggable() {
    const handlePointerDown = (e) => {
      // Don't drag if clicking mini toolbar or interactive buttons
      if (e.target.closest('.assistant-mini-toolbar') || e.target.closest('.ball-container')) return;

      this.isDragging = true;
      const rect = this.container.getBoundingClientRect();
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.initialLeft = rect.left;
      this.initialTop = rect.top;

      this.container.classList.remove('docked-bottom-right');
      this.container.style.left = `${this.initialLeft}px`;
      this.container.style.top = `${this.initialTop}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;

      let newX = this.initialLeft + dx;
      let newY = this.initialTop + dy;

      // Screen clamping
      const maxW = window.innerWidth - this.container.offsetWidth;
      const maxH = window.innerHeight - this.container.offsetHeight;

      newX = Math.max(10, Math.min(maxW - 10, newX));
      newY = Math.max(10, Math.min(maxH - 10, newY));

      this.container.style.left = `${newX}px`;
      this.container.style.top = `${newY}px`;
    };

    const handlePointerUp = () => {
      this.isDragging = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    this.container.addEventListener('pointerdown', handlePointerDown);
  }

  // 2. System Clock
  initClock() {
    const clockEl = document.getElementById('system-clock');
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // 3. Speech & Reaction Bubble Engine
  initSpeechSystem() {
    const quotes = [
      "MEtech 閃電星球已同步旋轉！能量全滿！⚡",
      "今天也是充滿幹勁的一天！專注工作，效率倍增 🚀",
      "記得喝口水、伸伸懶腰放鬆一下喔 🍵",
      "手中的科技之球，正為您的靈感護航 ✨",
      "點擊我或手中的球體，看看會有什麼驚喜吧！🐾",
      "保持專注，每一行代碼都在創造未來 💻"
    ];

    let quoteIndex = 0;
    this.speechInterval = setInterval(() => {
      if (!this.quotesEnabled) return;
      quoteIndex = (quoteIndex + 1) % quotes.length;
      this.say(quotes[quoteIndex], 5000);
    }, 18000);
  }

  say(text, duration = 4000) {
    if (!this.speechBubble || !this.speechText) return;
    this.speechText.textContent = text;
    this.speechBubble.classList.add('show');

    if (this.hideBubbleTimer) clearTimeout(this.hideBubbleTimer);
    this.hideBubbleTimer = setTimeout(() => {
      this.speechBubble.classList.remove('show');
    }, duration);
  }

  // 4. Web Audio Ambient Synthesizer
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  initSoundSynthesizer() {
    const chips = document.querySelectorAll('.sound-chip');
    const volSlider = document.getElementById('sound-vol');

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sound = chip.dataset.sound;
        if (chip.classList.contains('active') && this.activeNoiseNode) {
          chip.classList.remove('active');
          this.stopSound();
        } else {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.playSound(sound);
        }
      });
    });

    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        this.soundVolume = parseInt(e.target.value, 10) / 100;
        if (this.gainNode) {
          this.gainNode.gain.setValueAtTime(this.soundVolume, this.audioCtx.currentTime);
        }
      });
    }
  }

  playSound(type) {
    this.stopSound();
    const ctx = this.getAudioContext();
    this.currentSoundType = type;

    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    if (type === 'rain') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    } else if (type === 'waves') {
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = white * 0.15;
      }
    } else if (type === 'fire') {
      for (let i = 0; i < bufferSize; i++) {
        const crackle = (Math.random() > 0.997) ? (Math.random() * 2 - 1) : 0;
        const rumble = (Math.random() * 2 - 1) * 0.05;
        output[i] = crackle + rumble;
      }
    } else { // typing
      for (let i = 0; i < bufferSize; i++) {
        const click = (Math.random() > 0.9992) ? (Math.random() * 2 - 1) * 0.8 : 0;
        output[i] = click;
      }
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = (type === 'rain') ? 'lowpass' : (type === 'waves' ? 'bandpass' : 'lowpass');
    filter.frequency.setValueAtTime(type === 'rain' ? 1000 : 500, ctx.currentTime);

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.soundVolume * 0.4, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);

    whiteNoise.start();
    this.activeNoiseNode = whiteNoise;
  }

  stopSound() {
    if (this.activeNoiseNode) {
      try {
        this.activeNoiseNode.stop();
        this.activeNoiseNode.disconnect();
      } catch (e) {}
      this.activeNoiseNode = null;
    }
  }

  playChimeSound(freq = 440, type = 'sine', dur = 0.2) {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  }

  // 6. Pomodoro Timer
  initPomodoro() {
    const timeDisplay = document.getElementById('pomodoro-time');
    const startBtn = document.getElementById('btn-timer-start');
    const resetBtn = document.getElementById('btn-timer-reset');
    const modeBtn = document.getElementById('btn-timer-mode');
    const ringBar = document.getElementById('timer-ring-progress');
    const stateLabel = document.getElementById('pomodoro-state-label');

    const updateDisplay = () => {
      const m = Math.floor(this.pomoTimeRemaining / 60);
      const s = this.pomoTimeRemaining % 60;
      timeDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      // Progress bar (Circumference = 2 * PI * 54 = 339.292)
      const totalCircumference = 339.292;
      const progress = (this.pomoDuration - this.pomoTimeRemaining) / this.pomoDuration;
      ringBar.style.strokeDashoffset = totalCircumference * (1 - progress);
    };

    startBtn.addEventListener('click', () => {
      if (this.pomoRunning) {
        // Pause
        clearInterval(this.pomoInterval);
        this.pomoRunning = false;
        startBtn.textContent = '繼續專注';
        stateLabel.textContent = '已暫停 ⏸️';
      } else {
        // Start
        this.pomoRunning = true;
        startBtn.textContent = '暫停計時';
        stateLabel.textContent = '專注工作中 🔥';
        this.say('專注模式啟動！閃電能量陪你全力以赴 ⚡', 3000);

        this.pomoInterval = setInterval(() => {
          if (this.pomoTimeRemaining > 0) {
            this.pomoTimeRemaining--;
            updateDisplay();
          } else {
            // Timer Finished
            clearInterval(this.pomoInterval);
            this.pomoRunning = false;
            startBtn.textContent = '開始專注';
            stateLabel.textContent = '專注完成！🎉';
            this.triggerBounce();
            this.playChimeSound(880, 'triangle', 0.6);
            this.say('太棒了！專注時段完成，給自己喝杯水休息 5 分鐘吧！☕', 6000);
          }
        }, 1000);
      }
    });

    resetBtn.addEventListener('click', () => {
      clearInterval(this.pomoInterval);
      this.pomoRunning = false;
      this.pomoTimeRemaining = this.pomoDuration;
      startBtn.textContent = '開始專注';
      stateLabel.textContent = '準備就緒 ✨';
      updateDisplay();
    });

    modeBtn.addEventListener('click', () => {
      if (this.pomoMode === 25) {
        this.pomoMode = 50;
        this.pomoDuration = 50 * 60;
        modeBtn.textContent = '模式: 50分';
      } else if (this.pomoMode === 50) {
        this.pomoMode = 5;
        this.pomoDuration = 5 * 60;
        modeBtn.textContent = '模式: 5分休息';
      } else {
        this.pomoMode = 25;
        this.pomoDuration = 25 * 60;
        modeBtn.textContent = '模式: 25分';
      }
      this.pomoTimeRemaining = this.pomoDuration;
      updateDisplay();
    });

    updateDisplay();
  }

  // 7. To-Do List
  initTodoList() {
    const listEl = document.getElementById('todo-list');
    const inputEl = document.getElementById('todo-input');
    const addBtn = document.getElementById('btn-add-todo');

    const addTodo = () => {
      const text = inputEl.value.trim();
      if (!text) return;

      const li = document.createElement('li');
      li.className = 'todo-item';

      const checkSpan = document.createElement('span');
      checkSpan.className = 'todo-check';
      checkSpan.textContent = '○';

      const textSpan = document.createElement('span');
      textSpan.className = 'todo-text';
      textSpan.textContent = text;

      const delBtn = document.createElement('button');
      delBtn.className = 'todo-del';
      delBtn.textContent = '×';

      li.appendChild(checkSpan);
      li.appendChild(textSpan);
      li.appendChild(delBtn);

      listEl.appendChild(li);
      inputEl.value = '';
      this.say(`已記錄代辦事項：「${text}」📝`, 2500);
    };

    addBtn.addEventListener('click', addTodo);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTodo();
    });

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.todo-item');
      if (!item) return;

      if (e.target.classList.contains('todo-del')) {
        item.remove();
      } else if (e.target.classList.contains('todo-check') || e.target.classList.contains('todo-text')) {
        item.classList.toggle('done');
        const check = item.querySelector('.todo-check');
        check.textContent = item.classList.contains('done') ? '✓' : '○';
        if (item.classList.contains('done')) {
          this.triggerBounce();
          this.say('任務達成！太厲害了 🎉', 2000);
        }
      }
    });
  }

  // 8. AI Chat Helper
  initAIChat() {
    const chatMsgs = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');

    const sendMessage = () => {
      const query = chatInput.value.trim();
      if (!query) return;

      // Append user msg with safe textContent
      const userDiv = document.createElement('div');
      userDiv.className = 'chat-msg user';
      const userBubble = document.createElement('div');
      userBubble.className = 'msg-bubble';
      userBubble.textContent = query;
      userDiv.appendChild(userBubble);
      chatMsgs.appendChild(userDiv);
      chatInput.value = '';
      chatMsgs.scrollTop = chatMsgs.scrollHeight;

      // Smart Bot Response
      setTimeout(() => {
        const botDiv = document.createElement('div');
        botDiv.className = 'chat-msg bot';

        let reply = "了解！MEtech 閃電星球隨時為您提供最強大的算力與陪伴！⚡";
        if (query.includes('你好') || query.includes('嗨') || query.includes('hello')) {
          reply = "嗨！我是您的 MEtech 桌面助手 🐻 今天有什麼想一起完成的目標嗎？";
        } else if (query.includes('累') || query.includes('休息') || query.includes('放鬆')) {
          reply = "辛苦了！深呼吸，放鬆雙肩，聽聽左邊的雨聲或海浪白噪音吧 🍵✨";
        } else if (query.includes('加油') || query.includes('動力') || query.includes('激勵')) {
          reply = "每一滴努力都在閃閃發光！閃電能量注入完畢，我們一定可以做到的！🚀🔥";
        } else if (query.includes('球') || query.includes('轉動') || query.includes('閃電')) {
          reply = "手上的 MEtech 閃電星球正以 360 度連續轉動！點擊它還能爆發超光速能量喔！✨";
        }

        const botBubble = document.createElement('div');
        botBubble.className = 'msg-bubble';
        botBubble.textContent = reply;
        botDiv.appendChild(botBubble);
        chatMsgs.appendChild(botDiv);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;

        this.say(reply.length > 30 ? reply.substring(0, 30) + '...' : reply, 4000);
      }, 500);
    };

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
}
