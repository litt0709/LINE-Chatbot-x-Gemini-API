# Kế hoạch Cải thiện: Tóm tắt Tổng hợp theo Chủ đề / Vấn đề Chính (Topic-Centric Summary) — 2026-11-22

## 1. Nguyên nhân Gốc rễ (Root Cause)
- Tại [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L569-L571), khi người dùng yêu cầu tóm tắt nội dung trao đổi chung trong nhóm (*"tóm tắt lại nội dung trao đổi"*), code đang chèn chỉ thị cứng:
  > `[SYSTEM: CHỈ tóm tắt khách quan theo từng người nói, định dạng rõ: '• [Tên người]: [Ý kiến]', CẤM gộp lẫn lộn ý kiến người này sang người khác...]`
- Chỉ thị này ép LLM liệt kê máy móc từng câu phát biểu theo từng người (`• Lâm: ...`, `• Châu: ...`, `• Du: ...`) như biên bản gỡ băng thay vì tổng hợp nội dung cốt lõi để người đọc nắm bắt vấn đề.

## 2. Giải pháp Thông minh ($0 Compute Cost)
Tách biệt rõ 2 chế độ tóm tắt trong [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L567-L571):
1. **Tóm tắt chung nội dung trao đổi (Topic-Centric Synthesis):**
   - Gom nhóm theo **từng CHỦ ĐỀ / VẤN ĐỀ CHÍNH** (`• **[Chủ đề]**: tóm lược vấn đề, các luận điểm chính và kết luận/trạng thái nếu có`).
   - Lược bỏ tán gẫu vụn vặt, câu chào hỏi, câu xả rác; **CẤM** liệt kê máy móc từng câu theo từng người nói.
   - Chỉ nhắc tên thành viên khi cần làm rõ quan điểm trái chiều quan trọng (và vẫn giữ nguyên tắc không gán nhầm ý kiến người này sang người khác). Khách quan, súc tích, không hỏi ngược lại user.
2. **Tóm tắt riêng 1 cá nhân (`isTargetedSpeakerSummary`):**
   - Giữ nguyên cơ chế cô lập dữ liệu người nói (Speaker Isolation), bổ sung hướng dẫn cô đọng theo các ý chính thay vì chép lại từng tin nhắn rời rạc.
