const replyTemplates = {
  english: {
    askShopName: "Welcome to Kirana AI! 👋\nWhat is your shop name?",
    shopRegistered: (shop: string) =>
      `Great! ${shop} registered ✅\nWhat is your name?`,
    welcomeUser: (name: string, shop: string) =>
      `Welcome ${name}! 🎉\n${shop} is ready on Kirana AI.\n\nTry these:\n• add 10 soaps\n• sold 5 chips\n• show inventory\n• today report`,
    addSuccess: (qty: number, item: string, total: number, unit: string = "") =>
      `Added ${qty} ${unit} ${item}! 📦 Total stock: ${total} ${unit}`.replace(/\s+/g, " ").trim(),
    addSuccessWithMerge: (qty: number, unit: string, typed: string, matched: string, total: number) =>
      `Added ${qty}${unit ? " " + unit : ""} to '${matched}'! 📦 (I matched '${typed}' → '${matched}') Total: ${total}`,
    soldSuccess: (qty: number, item: string, remaining: number, unit: string = "") =>
      `Sold ${qty} ${unit} ${item}! 🛒 Remaining: ${remaining} ${unit}`.replace(/\s+/g, " ").trim(),
    lowStock: (item: string, remaining: number, unit: string = "") =>
      `⚠️ Low stock: ${item} only ${remaining} ${unit} left — reorder soon!`.replace(/\s+/g, " ").trim(),
    outOfStock: (item: string) =>
      `❌ ${item} is not in your stock. Add it first (e.g. 'add 10 ${item}').`,
    inventoryHeader: (name: string) => `${name}, here is your inventory:`,
    emptyStock: "No stock yet 📭 Try: 'add 10 soaps'",
    reportHeader: (name: string) => `${name}, here is today's report:`,
    emptyReport: "No transactions today yet! Start by adding stock 📦",
    noSalesToday: "Nothing sold today yet 🙂",
    lowStockHeader: (name: string) => `${name}, items to reorder:`,
    lowStockItem: (item: string, qty: number, unit: string) =>
      `⚠️ ${item}: only ${qty}${unit ? " " + unit : ""} left`,
    noLowStock: (name: string) => `${name}, all items have good stock! 🟢`,
    reportRevenue: (total: number) => `💰 Total revenue: ₹${total}`,
    weekReportHeader: (name: string) => `${name}, here is this week's report (7 days):`,
    monthReportHeader: (name: string) => `${name}, here is this month's report (30 days):`,
    topSeller: (item: string) => `🏆 Best seller: ${item}`,
    undoneAdd: (qty: number, item: string, newQty: number) =>
      `↩️ Undone: removed ${qty} ${item} (added by mistake). Stock now: ${newQty}`,
    undoneSell: (qty: number, item: string, newQty: number) =>
      `↩️ Undone: ${qty} ${item} back in stock. Stock now: ${newQty}`,
    nothingToUndo: "Nothing to undo 🤷",
    itemRemoved: (item: string) => `🗑️ ${item} removed from inventory.`,
    stockSet: (item: string, qty: number, unit: string) =>
      `✏️ ${item} stock set to ${qty} ${unit}`.replace(/\s+/g, " ").trim(),
    khataCredit: (name: string, amount: number, balance: number) =>
      `📒 ₹${amount} credit added for ${name}. Total due: ₹${balance}`,
    khataPayment: (name: string, amount: number, balance: number) =>
      balance > 0
        ? `📒 ${name} paid ₹${amount}. Remaining due: ₹${balance}`
        : `📒 ${name} paid ₹${amount}. Account settled ✅`,
    khataHeader: (name: string) => `${name}, your khata (credit) book:`,
    khataEmpty: "No pending credit 🟢 Khata is clean!",
    khataCustomer: (name: string, balance: number) =>
      balance > 0 ? `📒 ${name} owes ₹${balance}` : `📒 ${name} has no dues ✅`,
    khataTotal: (total: number) => `💰 Total to collect: ₹${total}`,
    khataUnknownCustomer: (name: string) => `🤔 No khata found for ${name}.`,
    askPrice: (item: string) => `What is the selling price of ${item}? (e.g. reply: 40)`,
    priceConfirmed: (item: string, price: number) => `✅ ${item} price saved: ₹${price}`,
    askPriceAgain: (item: string) => `Please reply with just the price number for ${item} (e.g. 40)`,
    priceUpdated: (item: string, price: number) => `✅ ${item} price updated to ₹${price}`,
    greeting: (name: string) =>
      `Hey ${name}! 👋 How can I help?\nTry: 'add 10 soaps' or 'show inventory'`,
    help:
      "Here's what I can do 🤖\n• add 10 soaps — add stock\n• sold 5 chips — record a sale\n• show inventory — full stock list\n• low stock — items to reorder\n• today report / week report — sales\n• sugar price 45 — set a price\n• ramesh udhaar 50 — khata credit\n• ramesh paid 30 — khata payment\n• udhaar list — who owes you\n• undo — cancel last entry",
    notUnderstood: "Didn't understand 🙏 Try: 'add 5 chips' or 'show inventory'",
    notUnderstoodLine: (line: string) => `⚠️ Didn't understand: "${line}"`,
    trialExpired: (support: string) =>
      `Your trial period is over. Please contact support${support ? ` (${support})` : ""} to activate your account and continue using Kirana AI.`,
    activated: "✅ Your Kirana AI account is now active! Thanks 🙏 Send any message to continue.",
  },
  telugu: {
    askShopName: "Kirana AI ki swaagatam! 👋\nMee shop peru cheppagalaru?",
    shopRegistered: (shop: string) =>
      `Baagundi! ${shop} register ayyindi ✅\nMee peru cheppandi?`,
    welcomeUser: (name: string, shop: string) =>
      `Swaagatam ${name} anna! 🎉\n${shop} Kirana AI lo ready ga undi.\n\nIvi try cheyyandi:\n• add 10 soaps\n• sold 5 chips\n• show inventory\n• today report`,
    addSuccess: (qty: number, item: string, total: number, unit: string = "") =>
      `${qty} ${unit} ${item} add chesamu! 📦 Meeru unna stock: ${total} ${unit}`.replace(/\s+/g, " ").trim(),
    addSuccessWithMerge: (qty: number, unit: string, typed: string, matched: string, total: number) =>
      `'${matched}' ki ${qty}${unit ? " " + unit : ""} add chesamu! 📦 ('${typed}' ante '${matched}' anukunnanu) Total: ${total}`,
    soldSuccess: (qty: number, item: string, remaining: number, unit: string = "") =>
      `${qty} ${unit} ${item} ammamu! 🛒 Migilina stock: ${remaining} ${unit}`.replace(/\s+/g, " ").trim(),
    lowStock: (item: string, remaining: number, unit: string = "") =>
      `⚠️ Stock takkuva: ${item} kevalam ${remaining} ${unit} undhi — tvaraga order ivvandi!`.replace(/\s+/g, " ").trim(),
    outOfStock: (item: string) =>
      `❌ ${item} mee stock lo ledu. Mundu add cheyyandi (e.g. 'add 10 ${item}').`,
    inventoryHeader: (name: string) => `${name} anna, mee inventory idi:`,
    emptyStock: "Stock emi ledu 📭 Try: 'add 10 soaps'",
    reportHeader: (name: string) => `${name} anna, neti report idi:`,
    emptyReport: "Neti transactions emi levu! Stock add cheyandi 📦",
    noSalesToday: "Inniki emee ammaledu 🙂",
    lowStockHeader: (name: string) => `${name} anna, ee items order ivvandi:`,
    lowStockItem: (item: string, qty: number, unit: string) =>
      `⚠️ ${item}: kevalam ${qty}${unit ? " " + unit : ""} undhi`,
    noLowStock: (name: string) => `${name} anna, anni items stock bagundi! 🟢`,
    reportRevenue: (total: number) => `💰 Mottam aaya: ₹${total}`,
    weekReportHeader: (name: string) => `${name} anna, ee vaaram report (7 rojulu):`,
    monthReportHeader: (name: string) => `${name} anna, ee nela report (30 rojulu):`,
    topSeller: (item: string) => `🏆 Ekkuva ammindi: ${item}`,
    undoneAdd: (qty: number, item: string, newQty: number) =>
      `↩️ Cancel chesamu: ${qty} ${item} teesesamu (tappuga add ayindi). Ippudu stock: ${newQty}`,
    undoneSell: (qty: number, item: string, newQty: number) =>
      `↩️ Cancel chesamu: ${qty} ${item} malli stock lo pettamu. Ippudu stock: ${newQty}`,
    nothingToUndo: "Cancel cheyadaniki emi ledu 🤷",
    itemRemoved: (item: string) => `🗑️ ${item} inventory nunchi teesesamu.`,
    stockSet: (item: string, qty: number, unit: string) =>
      `✏️ ${item} stock ${qty} ${unit} ga set chesamu`.replace(/\s+/g, " ").trim(),
    khataCredit: (name: string, amount: number, balance: number) =>
      `📒 ${name} ki ₹${amount} appu rasamu. Mottam baaki: ₹${balance}`,
    khataPayment: (name: string, amount: number, balance: number) =>
      balance > 0
        ? `📒 ${name} ₹${amount} kattaru. Migilina baaki: ₹${balance}`
        : `📒 ${name} ₹${amount} kattaru. Khata clear ayindi ✅`,
    khataHeader: (name: string) => `${name} anna, mee appu book:`,
    khataEmpty: "Evariki appu ledu 🟢 Khata clean ga undi!",
    khataCustomer: (name: string, balance: number) =>
      balance > 0 ? `📒 ${name} baaki: ₹${balance}` : `📒 ${name} ki baaki ledu ✅`,
    khataTotal: (total: number) => `💰 Mottam raavalsindi: ₹${total}`,
    khataUnknownCustomer: (name: string) => `🤔 ${name} peru tho khata ledu.`,
    askPrice: (item: string) => `${item} amme dhara enti? (e.g. reply: 40)`,
    priceConfirmed: (item: string, price: number) => `✅ ${item} dhara save chesamu: ₹${price}`,
    askPriceAgain: (item: string) => `${item} dhara number lo cheppandi (e.g. 40)`,
    priceUpdated: (item: string, price: number) => `✅ ${item} dhara update chesamu: ₹${price}`,
    greeting: (name: string) =>
      `Baagundi ${name} anna! 👋 Ela help cheyyali?\nTry: 'add 10 soaps' or 'show inventory'`,
    help:
      "Nenu cheyagalanu 🤖\n• add 10 soaps — stock add\n• sold 5 chips — ammakam record\n• show inventory — stock list\n• low stock — order cheyyalsina items\n• today report / vaaram report — ammakalu\n• sugar price 45 — dhara set\n• ramesh appu 50 — khata lo rayadam\n• ramesh 30 katti — appu katting\n• appu list — evaru baaki unnaru\n• undo — last entry cancel",
    notUnderstood: "Artham kaaledu 🙏 Try: 'add 5 chips' or 'show inventory'",
    notUnderstoodLine: (line: string) => `⚠️ Artham kaaledu: "${line}"`,
    trialExpired: (support: string) =>
      `Mee trial samayam ayipoyindi. Kirana AI ni thirigi vaadadaaniki support${support ? ` (${support})` : ""} ni sampradinchandi.`,
    activated: "✅ Mee Kirana AI account ippudu active! Thanks 🙏 Continue cheyadaniki edaina msg pettandi.",
  },
  hindi: {
    askShopName: "Kirana AI mein swagat! 👋\nApka shop ka naam kya hai?",
    shopRegistered: (shop: string) =>
      `Badhiya! ${shop} register ho gaya ✅\nApka naam batayein?`,
    welcomeUser: (name: string, shop: string) =>
      `Swagat hai ${name} bhai! 🎉\n${shop} Kirana AI pe ready hai.\n\nYe try karein:\n• add 10 soaps\n• sold 5 chips\n• show inventory\n• today report`,
    addSuccess: (qty: number, item: string, total: number, unit: string = "") =>
      `${qty} ${unit} ${item} add ho gaya! 📦 Total stock: ${total} ${unit}`.replace(/\s+/g, " ").trim(),
    addSuccessWithMerge: (qty: number, unit: string, typed: string, matched: string, total: number) =>
      `'${matched}' mein ${qty}${unit ? " " + unit : ""} add ho gaya! 📦 ('${typed}' se '${matched}' match kiya) Total: ${total}`,
    soldSuccess: (qty: number, item: string, remaining: number, unit: string = "") =>
      `${qty} ${unit} ${item} bik gaya! 🛒 Bacha hua: ${remaining} ${unit}`.replace(/\s+/g, " ").trim(),
    lowStock: (item: string, remaining: number, unit: string = "") =>
      `⚠️ Stock kam: ${item} sirf ${remaining} ${unit} bacha — jaldi order karo!`.replace(/\s+/g, " ").trim(),
    outOfStock: (item: string) =>
      `❌ ${item} aapke stock mein nahi hai. Pehle add karo (e.g. 'add 10 ${item}').`,
    inventoryHeader: (name: string) => `${name} bhai, aapki inventory:`,
    emptyStock: "Abhi koi stock nahi 📭 Try: 'add 10 soaps'",
    reportHeader: (name: string) => `${name} bhai, aaj ki report:`,
    emptyReport: "Aaj koi transaction nahi! Stock add karo 📦",
    noSalesToday: "Aaj abhi kuch nahi bika 🙂",
    lowStockHeader: (name: string) => `${name} bhai, ye items order karo:`,
    lowStockItem: (item: string, qty: number, unit: string) =>
      `⚠️ ${item}: sirf ${qty}${unit ? " " + unit : ""} bacha`,
    noLowStock: (name: string) => `${name} bhai, sab items ka stock theek hai! 🟢`,
    reportRevenue: (total: number) => `💰 Kul kamai: ₹${total}`,
    weekReportHeader: (name: string) => `${name} bhai, is hafte ki report (7 din):`,
    monthReportHeader: (name: string) => `${name} bhai, is mahine ki report (30 din):`,
    topSeller: (item: string) => `🏆 Sabse zyada bika: ${item}`,
    undoneAdd: (qty: number, item: string, newQty: number) =>
      `↩️ Undo ho gaya: ${qty} ${item} hata diya (galti se add hua tha). Ab stock: ${newQty}`,
    undoneSell: (qty: number, item: string, newQty: number) =>
      `↩️ Undo ho gaya: ${qty} ${item} wapas stock mein. Ab stock: ${newQty}`,
    nothingToUndo: "Undo karne ke liye kuch nahi 🤷",
    itemRemoved: (item: string) => `🗑️ ${item} inventory se hata diya.`,
    stockSet: (item: string, qty: number, unit: string) =>
      `✏️ ${item} ka stock ${qty} ${unit} set kar diya`.replace(/\s+/g, " ").trim(),
    khataCredit: (name: string, amount: number, balance: number) =>
      `📒 ${name} ka ₹${amount} udhaar likh diya. Kul baaki: ₹${balance}`,
    khataPayment: (name: string, amount: number, balance: number) =>
      balance > 0
        ? `📒 ${name} ne ₹${amount} diya. Baaki: ₹${balance}`
        : `📒 ${name} ne ₹${amount} diya. Khata saaf ✅`,
    khataHeader: (name: string) => `${name} bhai, aapka udhaar khata:`,
    khataEmpty: "Koi udhaar baaki nahi 🟢 Khata saaf hai!",
    khataCustomer: (name: string, balance: number) =>
      balance > 0 ? `📒 ${name} pe ₹${balance} baaki hai` : `📒 ${name} ka koi baaki nahi ✅`,
    khataTotal: (total: number) => `💰 Kul vasooli baaki: ₹${total}`,
    khataUnknownCustomer: (name: string) => `🤔 ${name} ke naam ka khata nahi mila.`,
    askPrice: (item: string) => `${item} ka selling price kya hai? (e.g. reply: 40)`,
    priceConfirmed: (item: string, price: number) => `✅ ${item} price save ho gaya: ₹${price}`,
    askPriceAgain: (item: string) => `Sirf number mein price batayein ${item} ka (e.g. 40)`,
    priceUpdated: (item: string, price: number) => `✅ ${item} ka price update ho gaya: ₹${price}`,
    greeting: (name: string) =>
      `Kya haal hai ${name} bhai! 👋 Kya help chahiye?\nTry: 'add 10 soaps' ya 'show inventory'`,
    help:
      "Main ye kar sakta hoon 🤖\n• add 10 soaps — stock add\n• sold 5 chips — sale record\n• show inventory — stock list\n• low stock — order karne wale items\n• today report / hafte ka report — bikri\n• sugar price 45 — price set\n• ramesh udhaar 50 — khata mein likho\n• ramesh ne 30 diya — udhaar wapas\n• udhaar list — kaun kitna dega\n• undo — last entry cancel",
    notUnderstood: "Samajh nahi aaya 🙏 Try: 'add 5 chips' ya 'show inventory'",
    notUnderstoodLine: (line: string) => `⚠️ Samajh nahi aaya: "${line}"`,
    trialExpired: (support: string) =>
      `Aapka trial period khatam ho gaya hai. Kirana AI ka upyog jari rakhne ke liye kripya support${support ? ` (${support})` : ""} se sampark karein.`,
    activated: "✅ Aapka Kirana AI account ab active hai! Shukriya 🙏 Continue karne ke liye koi bhi message bhejein.",
  },
};

type Lang = "english" | "telugu" | "hindi";

function getReply(lang: string) {
  return replyTemplates[lang as Lang] ?? replyTemplates.english;
}

export { replyTemplates, getReply, type Lang };
