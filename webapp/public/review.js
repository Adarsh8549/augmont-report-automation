// Approver review page. Reads ?token= from the emailed link, shows the report,
// and posts approve/reject decisions.

const $ = (s) => document.querySelector(s);
const token = new URLSearchParams(location.search).get("token");

async function load() {
  if (!token) return fail("No approval token in the link.");
  try {
    const res = await fetch(`/api/approval/${encodeURIComponent(token)}`);
    const a = await res.json();
    if (!res.ok) return fail(a.error || "Could not load this approval.");
    $("#r-title").textContent = a.title;
    $("#r-excerpt").textContent = a.excerpt || "";
    $("#r-image").innerHTML = `<img src="${a.imageUrl}" alt="Report preview" style="width:100%;border:1px solid var(--line);border-radius:8px" />`;
    if (a.state === "pending") {
      $("#r-actions").classList.remove("hidden");
    } else {
      $("#r-result").className = "result " + (a.state === "approved" ? "ok" : "err");
      $("#r-result").textContent = a.state === "approved"
        ? "✅ This report was already approved and published."
        : "This report was rejected (sent back to draft).";
    }
  } catch (e) {
    fail(String(e));
  }
}

function fail(msg) {
  $("#r-title").textContent = "Unavailable";
  $("#r-result").className = "result err";
  $("#r-result").textContent = msg;
}

async function decide(path, label) {
  $("#approve-btn").disabled = true;
  $("#reject-btn").disabled = true;
  $("#r-result").className = "result";
  $("#r-result").textContent = label + "…";
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "failed");
    $("#r-actions").classList.add("hidden");
    $("#r-result").className = "result ok";
    if (path === "/api/approve") {
      $("#r-result").innerHTML = `✅ Approved & published! <a href="${body.postUrl}" target="_blank">${body.postUrl}</a>`;
    } else {
      $("#r-result").textContent = "Rejected — the post was sent back to draft.";
    }
  } catch (e) {
    $("#r-result").className = "result err";
    $("#r-result").textContent = "Error: " + e.message;
    $("#approve-btn").disabled = false;
    $("#reject-btn").disabled = false;
  }
}

$("#approve-btn").addEventListener("click", () => decide("/api/approve", "Approving"));
$("#reject-btn").addEventListener("click", () => decide("/api/reject", "Rejecting"));

load();
