// ==========================================================================
// Curated Bilingual Trivia & Clean Humor Joke Pools
// Ensures authentic Traditional Chinese & English content without machine-translation loss
// ==========================================================================

const ZH_JOKES = [
  // 💼 職場摸魚與辦公室幽默
  {
    id: 'zh-joke-1',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '面試官問我：「你最大的缺點是什麼？」\n我：「太誠實了。」\n面試官：「我不覺得誠實是缺點。」',
    punchline: '我：「我才不在乎你覺得什麼。」',
    source: '職場幽默誌'
  },
  {
    id: 'zh-joke-2',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '主管問我：「這份緊急報告今天下班前能給我嗎？」',
    punchline: '我：「如果我今天不下班，是不是就不用給了？」',
    source: '辦公室生存手冊'
  },
  {
    id: 'zh-joke-3',
    categoryLabel: '💻 工程師輕鬆梗',
    title: '⚡ 工程師的日常',
    setup: '為什麼工程師喜歡在黑夜寫程式？',
    punchline: '因為 Bug 也是有作息的，晚上牠們都在睡覺。',
    source: 'CoderHumor'
  },
  {
    id: 'zh-joke-4',
    categoryLabel: '💻 工程師輕鬆梗',
    title: '⚡ 工程師的日常',
    setup: '老婆對程式設計師老公說：「你去市場買一把青菜，如果有賣西瓜的話，買一顆。」\n晚上老公回家，帶了一顆青菜。',
    punchline: '老婆驚訝問原因，老公回答：「因為市場真的有賣西瓜啊！（Boolean 邏輯）」',
    source: '工程師冷笑話'
  },
  {
    id: 'zh-joke-5',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '在公司裡最能打動人心、讓人瞬間精神百倍的三個字是什麼？不是「我愛你」……',
    punchline: '而是——「已匯款」！💰✨',
    source: '職場真實語錄'
  },
  {
    id: 'zh-joke-6',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '每天叫醒我的不是鬧鐘，也不是夢想……',
    punchline: '而是——再不起床，這個月的全勤獎金就飛了！⏰💸',
    source: '打工人日記'
  },
  {
    id: 'zh-joke-7',
    categoryLabel: '💻 工程師輕鬆梗',
    title: '⚡ 工程師的日常',
    setup: '世界上最遙遠的距離是什麼？',
    punchline: '是在同一個函式裡，你在最開頭定義了變數，而我在第 999 行找不到它。',
    source: 'Debug日常'
  },
  {
    id: 'zh-joke-8',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '同事問我：「你為什麼每天都戴著降噪耳機，但什麼音樂都沒播？」',
    punchline: '我：「這樣大家就不會發現我其實在發呆了。」🤫',
    source: '辦公室摸魚手冊'
  },
  {
    id: 'zh-joke-9',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '老闆走過來拍拍我的肩膀說：「加油！公司只要賺錢，絕對不會虧待你！」',
    punchline: '我默默點頭心想：「這餅好大，吃得我好飽。」🥞',
    source: '職場大餅研究所'
  },
  {
    id: 'zh-joke-10',
    categoryLabel: '💻 工程師輕鬆梗',
    title: '⚡ 工程師的日常',
    setup: '工程師去餐廳點餐：\n「服務生，來一份番茄炒蛋，不要番茄，蛋過敏。」',
    punchline: '系統回應：NullPointerException 記憶體溢出！💥',
    source: 'CodeHumor'
  },

  // 🧊 爆笑冷笑話與經典諧音梗
  {
    id: 'zh-joke-11',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '有一天皮卡丘走路，走著走著不小心跌倒了，請問牠變成了什麼？',
    punchline: '皮卡……丘（啾）痛！⚡🩹',
    source: '爆笑冷笑話'
  },
  {
    id: 'zh-joke-12',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '請問哪一隻羊最不合群？',
    punchline: '「喜羊羊」，因為只有牠喜洋洋，大家都在辛苦加班。🐑',
    source: '諧音梗大師'
  },
  {
    id: 'zh-joke-13',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '為什麼企鵝的肚子全都是白色的？',
    punchline: '因為企鵝的手太短了，洗澡的時候只能洗到前面！🐧🧼',
    source: '動物冷知識笑話'
  },
  {
    id: 'zh-joke-14',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '有一隻鴨子走在結冰的人行道上摔倒了，會變成什麼？',
    punchline: '呱呱落地（摔跤鴨）！🦆❄️',
    source: '每日冷梗'
  },
  {
    id: 'zh-joke-15',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '哪一種水果最老實、從來不說謊？',
    punchline: '芭樂，因為芭樂「不說芭樂話」！🍈',
    source: '水果諧音俱樂部'
  },
  {
    id: 'zh-joke-16',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '橡皮擦、鉛筆、尺在鉛筆盒裡聊天，誰最容易被打？',
    punchline: '橡皮擦，因為他最喜歡「擦嘴」！✏️🧼',
    source: '文具冷笑話'
  },
  {
    id: 'zh-joke-17',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '為什麼天上的星星永遠不會相撞？',
    punchline: '因為每一顆星星都有自帶「閃光燈」啊！✨🚗',
    source: '天文冷笑話'
  },
  {
    id: 'zh-joke-18',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '一隻海龜在馬路上走得很慢，路人問牠為什麼不搭計程車？',
    punchline: '海龜委屈地說：「因為我怕司機嫌我——太龜毛！」🐢',
    source: '動物趣味誌'
  },
  {
    id: 'zh-joke-19',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '小明把手機掉進了許願池，河神浮上來問：「你掉的是金 iPhone 還是銀 iPhone？」',
    punchline: '小明：「都不是，我掉的是那支快沒電、沒備份的舊手機！」🔋😭',
    source: '現代民間故事'
  },
  {
    id: 'zh-joke-20',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '為什麼大象的脖子特別短？',
    punchline: '因為如果大象脖子太長，轉頭的時候會撞到後面排隊的大象。🐘',
    source: '冷知識笑話'
  },

  // ☕ 生活趣味與機智哲理
  {
    id: 'zh-joke-21',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '今天站上體重機，發現自己重了兩公斤，我決定欣然接受——',
    punchline: '畢竟肚子裡裝著滿滿的才華與智慧，重一點是合理的！✨',
    source: '樂觀人生哲學'
  },
  {
    id: 'zh-joke-22',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '有人說金錢買不到快樂……',
    punchline: '那是因為他不知道下午茶的珍珠奶茶跟雞排去哪裡買！🧋🍗',
    source: '美食解憂雜貨店'
  },
  {
    id: 'zh-joke-23',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '你知道吃甜點（Desserts）有什麼深奧的心理學好處嗎？',
    punchline: '因為 Desserts 倒過來拼就是 Stressed（壓力），吃甜點就是把壓力完全逆轉！🍰🎉',
    source: '甜點療癒學'
  },
  {
    id: 'zh-joke-24',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '每次下定決心要開始認真運動減肥時，我的胃總是跳出來抗議說：',
    punchline: '「你先去吃飽！吃飽了才有力氣減肥啊！」🍕🍔',
    source: '吃貨真理'
  },
  {
    id: 'zh-joke-25',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '世界上最遙遠的距離是什麼？不是生與死……',
    punchline: '而是被窩裡非常溫暖，而手機在三公尺外的書桌上響著。🛌📱',
    source: '冬天生活觀察'
  },
  {
    id: 'zh-joke-26',
    categoryLabel: '💻 工程師輕鬆梗',
    title: '⚡ 工程師的日常',
    setup: '硬體工程師與軟體工程師被困在電梯裡，硬體工程師說：「我們拆開按鈕面板修修看！」',
    punchline: '軟體工程師說：「不用那麼麻煩，我們先走出去再走進來一次試試看（重開機）。」🚪🔄',
    source: 'IT經典笑話'
  },
  {
    id: 'zh-joke-27',
    categoryLabel: '💼 職場摸魚幽默',
    title: '☕ 今日摸魚笑一笑',
    setup: '如何在一秒鐘之內讓整個辦公室的所有同事同時露出羨慕又嫉妒的眼神？',
    punchline: '在下午五點半準時站起來，微笑說：「大家辛苦了，我先下班囉～」👋🏃',
    source: '下班神技'
  },
  {
    id: 'zh-joke-28',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '什麼動物最容易被劇透？',
    punchline: '「雷龍」，因為牠全身都是雷！🦕💥',
    source: '恐龍諧音冷笑話'
  },
  {
    id: 'zh-joke-29',
    categoryLabel: '😄 職場放鬆冷笑話',
    title: '🎭 經典超冷笑話',
    setup: '哪一種蔬菜最喜歡大驚小怪？',
    punchline: '「驚」針菇（金針菇）！🍄😲',
    source: '廚房冷笑話'
  },
  {
    id: 'zh-joke-30',
    categoryLabel: '☕ 生活趣味笑話',
    title: '😄 日常機智幽默',
    setup: '去便當店買晚餐，老闆娘熱情地大喊：「帥哥，今天想吃什麼主餐？」',
    punchline: '就憑這句「帥哥」，我差點把錢包直接送給她！🍱😎',
    source: '溫暖便當店'
  }
];

const ZH_FACTS = [
  {
    id: 'zh-fact-1',
    categoryLabel: '🌱 生活奇妙冷知識',
    title: '💡 趣味生活小知識',
    content: '蜂蜜是世界上唯一一種永遠不會變質腐壞的天然食物！考古學家在古埃及金字塔中挖掘出的三千年前蜂蜜，至今依然純淨且可以食用。🍯',
    source: '食品科學探索'
  },
  {
    id: 'zh-fact-2',
    categoryLabel: '🔬 奇妙生物小百科',
    title: '💡 趣味自然小知識',
    content: '海獺在水面上睡覺的時候會手牽著手，這樣彼此就不會被夜晚的海浪與潮汐沖散，是非常溫馨的自然保護習性！🦦🌊',
    source: '海洋生物圖鑑'
  },
  {
    id: 'zh-fact-3',
    categoryLabel: '🔬 奇妙生物小百科',
    title: '💡 趣味自然小知識',
    content: '章魚擁有三顆心臟、藍色的血液，而且牠們全身超過三分之二的神經元分佈在八條腕足上，這意味著牠們的觸手可以獨立思考與探索！🐙',
    source: '海洋百科'
  },
  {
    id: 'zh-fact-4',
    categoryLabel: '🌱 生活奇妙冷知識',
    title: '💡 趣味生活小知識',
    content: '在植物學分類上，香蕉與番茄其實都屬於「漿果（Berry）」，而外表長滿小種子的草莓在植物學上反而不是真正的漿果喔！🍌🍓',
    source: '植物植物學雜誌'
  },
  {
    id: 'zh-fact-5',
    categoryLabel: '🧠 人體科學冷知識',
    title: '💡 趣味健康小知識',
    content: '貓咪放鬆時發出的呼嚕聲頻率大約在 20 到 140 赫茲之間，醫學研究發現這個特定頻率能促進骨骼修復、緩解肌肉緊張，並幫助人類舒緩壓力！🐱💆',
    source: '醫學與自然期刊'
  },
  {
    id: 'zh-fact-6',
    categoryLabel: '🧠 人體科學冷知識',
    title: '💡 趣味健康小知識',
    content: '當我們進入深度睡眠時，大腦會啟動獨特的「腦脊髓液清洗機制」，就像大腦在自動洗澡一樣，將白天累積的神經代謝廢物徹底清除乾淨！😴🧠',
    source: '神經科學研究'
  },
  {
    id: 'zh-fact-7',
    categoryLabel: '🌱 生活奇妙冷知識',
    title: '💡 趣味生活小知識',
    content: '下雨過後空氣中那股令人心曠神怡的泥土芬芳，是由土壤中的放線菌產生的化合物「土臭素（Geosmin）」，人類的嗅覺對它的敏感度甚至超越鯊魚對血液的靈敏度！🌧️🌿',
    source: '自然化學探秘'
  },
  {
    id: 'zh-fact-8',
    categoryLabel: '🔬 奇妙生物小百科',
    title: '💡 趣味自然小知識',
    content: '企鵝其實是有膝蓋的！只是牠們的膝蓋被藏在厚實濃密的羽毛與皮下脂肪層裡面，所以走路時才會看起來像可愛的搖擺小紳士。🐧❄️',
    source: '極地生物科普'
  },
  {
    id: 'zh-fact-9',
    categoryLabel: '🌱 生活奇妙冷知識',
    title: '💡 趣味生活小知識',
    content: '水獺的胸前皮毛下有一個天生的「小口袋」，牠們會把自己最喜歡、用來敲開貝殼與蛤蜊的專屬幸運石頭藏在裡面，終生隨身攜帶！🦦💎',
    source: '動物生活觀察'
  },
  {
    id: 'zh-fact-10',
    categoryLabel: '🔬 天文科學小百科',
    title: '💡 趣味宇宙小知識',
    content: '在金星上，一天的時間比一年還要長！因為金星自轉一圈需要 243 個地球日，而繞太陽公轉一圈只需要 225 個地球日。🪐✨',
    source: 'NASA天文通訊'
  }
];

const EN_JOKES = [
  {
    id: 'en-joke-1',
    categoryLabel: '😄 Workplace Humor',
    title: '☕ Quick Giggle',
    setup: 'Why do we tell actors to "break a leg"?',
    punchline: 'Because every play has a cast! 🎭',
    source: 'DailyHumor'
  },
  {
    id: 'en-joke-2',
    categoryLabel: '💻 Tech Humor',
    title: '⚡ Developer Banter',
    setup: 'Why do programmers prefer dark mode?',
    punchline: 'Because light attracts bugs! 🐛💻',
    source: 'DevJokes'
  },
  {
    id: 'en-joke-3',
    categoryLabel: '😄 Clean Humor & Joke',
    title: '🎭 Joke of the Day',
    setup: 'Why did the scarecrow win an award?',
    punchline: 'Because he was outstanding in his field! 🌾',
    source: 'DadJokes'
  },
  {
    id: 'en-joke-4',
    categoryLabel: '😄 Clean Humor & Joke',
    title: '🎭 Joke of the Day',
    setup: 'What do you call a fake noodle?',
    punchline: 'An impasta! 🍝',
    source: 'ClassicHumor'
  },
  {
    id: 'en-joke-5',
    categoryLabel: '☕ Office Wit',
    title: '☕ Quick Smile',
    setup: 'My boss told me to have a good day...',
    punchline: 'So I went home! 🏠✨',
    source: 'OfficeLaughs'
  }
];

const EN_FACTS = [
  {
    id: 'en-fact-1',
    categoryLabel: '🌱 Daily Life Trivia',
    title: '💡 Fun Fact of the Moment',
    content: 'Honey never spoils! Archaeologists have found 3,000-year-old honey in ancient Egyptian tombs that is still completely edible. 🍯',
    source: 'ScienceDaily'
  },
  {
    id: 'en-fact-2',
    categoryLabel: '🔬 Nature & World Fact',
    title: '💡 Nature Trivia',
    content: 'Sea otters hold hands while sleeping so they do not drift away with ocean currents! 🦦🌊',
    source: 'WildlifeDigest'
  },
  {
    id: 'en-fact-3',
    categoryLabel: '🔬 Nature & World Fact',
    title: '💡 Nature Trivia',
    content: 'Octopuses have three hearts, blue blood, and two-thirds of their neurons are located in their arms! 🐙',
    source: 'OceanFacts'
  }
];

module.exports = {
  ZH_JOKES,
  ZH_FACTS,
  EN_JOKES,
  EN_FACTS
};
