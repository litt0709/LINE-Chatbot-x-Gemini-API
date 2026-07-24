const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.tele-ai-chatbot" });

// Khởi tạo Firebase Admin SDK cục bộ cho test script
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const { saveFact, getFactsIndex, getFactDetail, rtdb } = require("./utils/db");
const { chat } = require("./utils/deepseek");

const testSessionId = "test_session_999";

async function runTest() {
  console.log("--- BẮT ĐẦU KIỂM THỬ LUỒNG FACTS MEMORY DB ---");

  // 1. Dọn dẹp test session cũ trên RTDB
  console.log(`\n1. Đang dọn dẹp data cũ của ${testSessionId} trên RTDB...`);
  await rtdb.ref(`facts/users/${testSessionId}`).remove();
  console.log("Đã dọn dẹp xong.");

  // Import index.js sau khi đã khởi tạo Admin SDK
  const { findRelevantFacts, processAndExtractProfile } = require("./index");

  // 2. Mô phỏng tin nhắn cung cấp tri thức mới
  const testMessage = "Annie nhớ nhé, lịch họp định kỳ của team marketing là 15h chiều thứ Sáu hàng tuần.";
  console.log(`\n2. Gửi tin nhắn học facts: "${testMessage}"`);

  const reply1 = await chat(
    testSessionId,
    testMessage,
    "Eddy",
    "eddy_test_user",
    null,
    "",
    false,
    "",
    false
  );

  console.log("Bot trả về raw:\n", reply1);

  // Bóc tách tag <FACT> và lưu vào DB
  console.log("\n3. Bóc tách tag <FACT> và lưu vào RTDB...");
  const extracted = await processAndExtractProfile(reply1, "eddy_test_user", {}, testSessionId, "Eddy", "Telegram");
  console.log("Kết quả bóc tách text:", extracted.text);

  // Đợi 2 giây để RTDB hoàn thành việc ghi dữ liệu
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Kiểm tra dữ liệu trên RTDB
  console.log("\n4. Kiểm tra dữ liệu lưu trên RTDB...");
  const indexSnap = await rtdb.ref(`facts/users/${testSessionId}/index`).once("value");
  const detailSnap = await rtdb.ref(`facts/users/${testSessionId}/detail`).once("value");
  
  console.log("RTDB Index:", JSON.stringify(indexSnap.val(), null, 2));
  console.log("RTDB Detail:", JSON.stringify(detailSnap.val(), null, 2));

  if (!indexSnap.exists()) {
    console.error("❌ Lỗi: Không tìm thấy Fact Index trên RTDB.");
    process.exit(1);
  }

  // 5. Kiểm tra truy xuất bộ nhớ
  const queryMessage = "Annie ơi nhóm marketing họp lúc nào ấy nhỉ?";
  console.log(`\n5. Đặt câu hỏi kiểm tra: "${queryMessage}"`);

  console.log("Đang so khớp từ khóa và tải facts liên quan...");
  const factsContext = await findRelevantFacts(testSessionId, queryMessage);
  console.log("Facts Context thu được:\n", factsContext);

  if (!factsContext || !factsContext.includes("15h")) {
    console.error("❌ Lỗi: Không truy xuất được facts liên quan hoặc thiếu thông tin cốt lõi.");
    process.exit(1);
  }
  console.log("✅ Thành công: Đã tìm thấy fact liên quan trong cache/RTDB!");

  // 6. Gửi câu hỏi kèm factsContext cho LLM để tạo phản hồi cuối cùng
  console.log("\n6. Gửi câu hỏi và facts context cho LLM...");
  const reply2 = await chat(
    testSessionId,
    queryMessage,
    "Eddy",
    "eddy_test_user",
    null,
    "",
    false,
    "",
    false,
    "",
    false,
    "",
    factsContext
  );

  console.log("Bot trả lời dựa trên facts đã nhớ:\n", reply2);
  console.log("\n✅ HOÀN THÀNH KIỂM THỬ THÀNH CÔNG!");
  process.exit(0);
}

runTest().catch(err => {
  console.error("Lỗi trong quá trình chạy test:", err);
  process.exit(1);
});
