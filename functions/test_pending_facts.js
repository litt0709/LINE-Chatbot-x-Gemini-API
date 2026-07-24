const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env" });

// Khởi tạo Firebase Admin nếu chưa khởi tạo
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const { saveFact, rtdb } = require("./utils/db");
const { processAndExtractProfile } = require("./index");

const testSessionId = "test_pending_session_9999";
const testFactContent = "Nguyen Thanh Nam la cuu Hieu truong dau tien cua VinUni.";
const testLLMReply = `Dạ anh, em đã ghi nhận thông tin này ạ. <FACT action="ADD" topic="vinuni" keywords="nguyen thanh nam, vinuni, hieu truong" content="${testFactContent}" />`;

const runTest = async () => {
  console.log("--- BẮT ĐẦU KIỂM THỬ LUỒNG PHÊ DUYỆT PENDING GLOBAL FACT ---");

  // 1. Dọn dẹp dữ liệu cũ
  console.log("1. Dọn dẹp dữ liệu test cũ trên RTDB...");
  await rtdb.ref(`facts/users/${testSessionId}`).remove();
  await rtdb.ref("facts/pending").remove();
  
  // 2. Chạy hàm bóc tách tag <FACT>
  console.log("\n2. Chạy hàm processAndExtractProfile để sinh ra pending fact...");
  const extracted = await processAndExtractProfile(testLLMReply, "test_user_id", {}, testSessionId, "EddyTest", "Telegram");
  console.log("-> Text sau khi bóc tách:", extracted.text);

  // Đợi 1.5 giây để DB hoàn thành ghi
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 3. Kiểm tra xem fact cục bộ và pending fact đã được lưu chưa
  console.log("\n3. Kiểm tra dữ liệu trên RTDB...");
  const userFactSnap = await rtdb.ref(`facts/users/${testSessionId}/detail`).once("value");
  const pendingFactSnap = await rtdb.ref("facts/pending").once("value");

  console.log("-> User Fact cục bộ tồn tại:", userFactSnap.exists());
  console.log("-> Pending Fact tồn tại:", pendingFactSnap.exists());

  if (!userFactSnap.exists() || !pendingFactSnap.exists()) {
    console.error("❌ THẤT BẠI: Fact chưa được lưu đúng!");
    process.exit(1);
  }

  const pendingFacts = pendingFactSnap.val();
  const factId = Object.keys(pendingFacts)[0];
  const pendingData = pendingFacts[factId];
  console.log(`-> Tìm thấy Pending Fact ID: ${factId}`);
  console.log("-> Chi tiết dữ liệu pending:", pendingData);

  // 4. Giả lập logic Phê duyệt (Approve) từ Admin Eddy
  console.log("\n4. Giả lập Admin Eddy click nút [Duyệt Global]...");
  
  // Đọc pending data
  if (pendingData) {
    // Lưu thành global fact
    await saveFact("global", null, factId, pendingData.topic, pendingData.keywords, pendingData.content);
    // Xóa khỏi pending
    await rtdb.ref(`facts/pending/${factId}`).remove();
    console.log("-> Đã chuyển fact sang global và xóa khỏi pending thành công.");
  }

  // Đợi 1 giây
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 5. Kiểm tra kết quả sau khi duyệt
  console.log("\n5. Kiểm tra kết quả trên RTDB...");
  const globalFactSnap = await rtdb.ref(`facts/global/detail/${factId}`).once("value");
  const pendingFactCheckSnap = await rtdb.ref(`facts/pending/${factId}`).once("value");

  console.log("-> Global Fact chi tiết đã được lưu:", globalFactSnap.exists());
  console.log("-> Pending Fact đã bị xóa:", !pendingFactCheckSnap.exists());

  if (globalFactSnap.exists() && !pendingFactCheckSnap.exists()) {
    console.log("\n✅ KIỂM THỬ THÀNH CÔNG RỰC RỠ! Cơ chế pending và nâng cấp thành Global Fact hoạt động chính xác!");
  } else {
    console.error("\n❌ THẤT BẠI: Logic duyệt global fact hoạt động không đúng.");
    process.exit(1);
  }

  // Dọn dẹp dữ liệu kiểm thử
  await rtdb.ref(`facts/users/${testSessionId}`).remove();
  await rtdb.ref(`facts/global/index/${factId}`).remove();
  await rtdb.ref(`facts/global/detail/${factId}`).remove();
  console.log("\n-> Đã dọn dẹp dữ liệu kiểm thử sạch sẽ.");
  process.exit(0);
};

runTest().catch(err => {
  console.error("Lỗi khi chạy kiểm thử:", err);
  process.exit(1);
});
