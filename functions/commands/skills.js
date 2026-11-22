const { getBotSkills, findSkillByQuery } = require("../utils/skillLibrary");

const CATEGORY_LABELS = {
  creative: "🎨 Sáng tạo & Ngôn từ",
  tech: "💻 Công nghệ & Lập trình",
  finance: "💰 Tài chính & Kinh doanh",
  language: "🌐 Ngôn ngữ & Dịch thuật",
  communication: "✉️ Giao tiếp & Công việc",
  thinking: "🧠 Tư duy & Phân tích",
  productivity: "📋 Hiệu suất & Tổng hợp",
  lifestyle: "🌿 Đời sống & Mua sắm",
  general: "✨ Kỹ năng khác"
};

/**
 * Xử lý lệnh /skills và /skills_detail <tên skill> (Zero LLM Cost)
 */
async function handleSkillsCommand(prompt) {
  const clean = prompt.trim();
  const skillsMap = await getBotSkills(true); // Luôn đọc bản mới nhất khi user hỏi trực tiếp
  const skillsList = Object.values(skillsMap || {});

  // 1. /skills_detail <tên skill>
  const detailMatch = clean.match(/^\/skills_detail(?:@\w+)?(?:\s+(.+))?$/i);
  if (detailMatch) {
    const query = (detailMatch[1] || "").trim();
    if (!query) {
      return "Dạ anh/chị nhập thêm tên hoặc mã skill nhé! Ví dụ:\n`/skills_detail tho_luc_bat` hoặc `/skills_detail thơ lục bát`\n(Gõ `/skills` để xem toàn bộ danh sách ạ)";
    }

    const found = findSkillByQuery(query, skillsMap);
    if (!found) {
      const slugs = skillsList.slice(0, 10).map(s => `\`${s.slug}\``).join(", ");
      return `Em chưa tìm thấy skill nào khớp với "${query}" ạ. 😅\nMột số mã skill hiện có: ${slugs}\nAnh/chị gõ \`/skills\` để xem danh sách đầy đủ nha!`;
    }

    const catLabel = CATEGORY_LABELS[found.category] || CATEGORY_LABELS.general;
    const triggersStr = (found.triggers || []).map(t => `\`${t}\``).join(", ");
    return [
      `🧩 *Chi tiết Skill: ${found.name}*`,
      `• *Mã (slug):* \`${found.slug}\``,
      `• *Nhóm:* ${catLabel}`,
      `• *Phiên bản:* v${found.version || 1} (cập nhật: ${found.updatedAt || "N/A"})`,
      `• *Mô tả:* ${found.summary || "Không có"}`,
      `• *Từ khóa kích hoạt:* ${triggersStr || "Không có"}`,
      ``,
      `📝 *Custom Prompt:*`,
      `${found.prompt}`
    ].join("\n");
  }

  // 2. /skills
  if (/^\/skills(?:@\w+)?$/i.test(clean)) {
    if (skillsList.length === 0) {
      return "Hiện tại em chưa có custom skill nào trong thư viện ạ.";
    }

    const grouped = {};
    for (const s of skillsList) {
      const cat = s.category || "general";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }

    const lines = [`📚 *Kho Custom Skills của Annie (${skillsList.length} kỹ năng)*\n`];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`${CATEGORY_LABELS[cat] || CATEGORY_LABELS.general}`);
      for (const item of items) {
        lines.push(`• *${item.name}* (\`${item.slug}\` • v${item.version || 1}): ${item.summary}`);
      }
      lines.push("");
    }
    lines.push("💡 Xem chi tiết prompt: gõ `/skills_detail <tên hoặc mã skill>` (vd: `/skills_detail tho_luc_bat`).");
    return lines.join("\n").trim();
  }

  return null;
}

module.exports = {
  handleSkillsCommand
};
