const { db } = require("../functions/utils/db");

async function main() {
  try {
    const snapshot = await db.collection("audit_logs").get();
    if (snapshot.empty) {
      console.log("No documents found in audit_logs.");
      return;
    }

    const issues = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.audit_issues && data.audit_issues.length > 0) {
        issues.push({
          docId: doc.id,
          audit_issues: data.audit_issues
        });
      }
    });

    console.log(JSON.stringify(issues, null, 2));
  } catch (error) {
    console.error("Error fetching audit logs:", error);
  }
}

main();
