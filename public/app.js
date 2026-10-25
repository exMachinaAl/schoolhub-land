"use strict";

/** School Portal UI only. Authorization MUST be enforced on each backend. */
(async () => {
  let config;
  try {
    const result = await fetch('/api/public/config', {cache:'no-store'});
    if (!result.ok) throw new Error('HTTP '+result.status);
    config = await result.json();
  } catch (error) {
    const grid=document.querySelector('#cards-grid');
    const notice=document.createElement('p');
    notice.className='load-error';
    notice.textContent='Direktori belum dapat dimuat. Periksa server atau hubungi pengelola. ('+error.message+')';
    grid.replaceChildren(notice);
    return;
  }
  const apps = Array.isArray(config.applications) ? config.applications : [];
  const school = config.school || {};
  const labels = { internal: "Internal", sekolah: "Akun Sekolah", publik: "Layanan Publik" };
  const icons = new Set(["file-text", "graduation-cap", "book-open", "boxes", "briefcase-business", "calendar-check", "arrow-up-right"]);
  const state = { filter: "semua", search: "" };
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const icon = (name) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + (icons.has(name) ? name : "file-text"));
    svg.append(use);
    return svg;
  };
  const validatedUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const u = new URL(value.trim());
      if (u.username || u.password) return null;
      const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.protocol !== "https:" && !(localhost && u.protocol === "http:")) return null;
      return u.href;
    } catch { return null; }
  };
  const normalize = (value) => String(value || "").toLocaleLowerCase("id-ID");

  document.title = `${school.name || "Portal Sekolah Digital"} — Pusat Akses Layanan`;
  $("#brand-name").textContent = school.shortName || "SchoolHub";
  $("#footer-school").textContent = school.name || "Portal Sekolah Digital";
  $("#year-tag").textContent = `TAHUN AJARAN ${school.academicYear || "—"}`;
  $("#footer-year").textContent = `${new Date().getFullYear()} • Portal Sekolah`;
  $("#count-all").textContent = apps.length;
  $("#hero-app-count").textContent = apps.length;
  $("#overview-app-count").textContent = String(apps.length).padStart(2, "0");

  function makeCard(app) {
    const category = labels[app.category] ? app.category : "sekolah";
    const url = validatedUrl(app.url);
    const card = el("article", "app-card");
    card.dataset.category = category;
    const top = el("div", "card-top");
    const mark = el("span", "card-icon"); mark.append(icon(app.icon));
    top.append(mark, el("span", "card-badge", labels[category]));
    card.append(top, el("h3", "", app.name || "Aplikasi Sekolah"), el("p", "card-desc", app.shortDescription || "Aplikasi layanan sekolah."));
    const tags = el("div", "card-tags");
    (Array.isArray(app.features) ? app.features.slice(0, 3) : []).forEach((feature) => tags.append(el("span", "", feature)));
    card.append(tags, el("div", "card-divider"));
    const foot = el("div", "card-foot");
    const status = el("span", `card-status${url ? " connected" : ""}`);
    status.append(el("span", "status-dot"), document.createTextNode(url ? "Tautan tersedia" : "Belum terhubung"));
    const actions = el("div", "card-actions");
    const detail = el("button", "detail-button", "Detail");
    detail.type = "button";
    detail.setAttribute("aria-label", `Lihat detail ${app.name}`);
    detail.addEventListener("click", () => openDetails(app));
    actions.append(detail);
    if (url) {
      const open = el("a", "open-button is-ready", "Buka");
      open.href = url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.setAttribute("aria-label", `Buka aplikasi ${app.name} di tab baru`);
      open.append(icon("arrow-up-right"));
      actions.append(open);
    } else {
      const open = el("button", "open-button", "Detail");
      open.type = "button";
      open.setAttribute("aria-label", `Informasi alamat ${app.name}`);
      open.addEventListener("click", () => openDetails(app));
      actions.append(open);
    }
    foot.append(status, actions);
    card.append(foot);
    return card;
  }

  function render() {
    const grid = $("#cards-grid");
    const fragment = document.createDocumentFragment();
    const visible = apps.filter((app) => {
      if (state.filter !== "semua" && app.category !== state.filter) return false;
      const text = normalize([app.name, app.shortDescription, app.audience, ...(app.features || [])].join(" "));
      return text.includes(normalize(state.search.trim()));
    });
    visible.forEach((app) => fragment.append(makeCard(app)));
    grid.replaceChildren(fragment);
    $("#empty-state").hidden = visible.length > 0;
  }

  function openDetails(app) {
    const url = validatedUrl(app.url);
    $("#dialog-icon").replaceChildren(icon(app.icon));
    $("#dialog-category").textContent = labels[app.category] || "Aplikasi Sekolah";
    $("#dialog-title").textContent = app.name || "Aplikasi Sekolah";
    $("#dialog-description").textContent = app.shortDescription || "";
    $("#dialog-audience").textContent = app.audience || "Pengguna terdaftar";
    $("#dialog-requirements").textContent = app.requirements || "Login dan izin sesuai sistem terkait.";
    const tags = $("#dialog-features");
    tags.replaceChildren(...(Array.isArray(app.features) ? app.features : []).map((value) => el("span", "", value)));
    const launch = $("#dialog-open");
    launch.hidden = !url;
    $("#dialog-no-url").hidden = !!url;
    if (url) launch.href = url;
    else launch.removeAttribute("href");
    $("#app-dialog").showModal();
  }

  $("#dialog-close").addEventListener("click", () => $("#app-dialog").close());
  $("#app-dialog").addEventListener("click", (event) => {
    if (event.target === $("#app-dialog")) $("#app-dialog").close();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => {
        const active = b === button;
        b.classList.toggle("is-selected", active);
        b.setAttribute("aria-pressed", String(active));
      });
      render();
    });
  });
  $("#search-input").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  $("#reset-filters").addEventListener("click", () => {
    $("#search-input").value = "";
    state.search = "";
    document.querySelector('[data-filter="semua"]').click();
  });
  render();
})();
