document.addEventListener("DOMContentLoaded", () => {
  // 1. Auto-dismiss flash toasts after 4 seconds
  const toasts = document.querySelectorAll(".toast");
  toasts.forEach((toast) => {
    setTimeout(() => {
      toast.style.transition = "opacity 0.3s ease";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  });

  // Elements for live template preview and character counter
  const templateInput = document.getElementById("template-input");
  const linkInput = document.getElementById("link-input");
  const charCounter = document.getElementById("char-counter");
  const previewBubble = document.getElementById("preview-bubble");
  const hiddenKeywords = document.getElementById("keywords-hidden");

  function updatePreview() {
    if (!templateInput || !previewBubble) return;

    const rawTemplate = templateInput.value || "";
    const link = linkInput?.value || "https://example.com/your-link";
    const firstKeyword = hiddenKeywords?.value ? hiddenKeywords.value.split(",")[0] : "link";

    let rendered = rawTemplate
      .replace(/{{link}}/g, link)
      .replace(/{{username}}/g, "alex")
      .replace(/{{keyword}}/g, firstKeyword);

    if (rendered.length > 800) {
      rendered = rendered.slice(0, 800);
    }

    previewBubble.textContent = rendered;

    if (charCounter) {
      const len = rawTemplate.length;
      charCounter.textContent = `${len} / 800`;
      if (len > 800) {
        charCounter.style.color = "var(--danger)";
      } else {
        charCounter.style.color = "var(--muted)";
      }
    }
  }

  if (templateInput) {
    templateInput.addEventListener("input", updatePreview);
  }
  if (linkInput) {
    linkInput.addEventListener("input", updatePreview);
  }

  // 2. Segmented control switching
  const segmentedControls = document.querySelectorAll(".segmented-control");
  segmentedControls.forEach((control) => {
    const options = control.querySelectorAll(".segment-option");
    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        options.forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        const radio = opt.querySelector("input[type='radio']");
        if (radio) {
          radio.checked = true;
          updatePreview();
        }
      });
    });
  });

  // 3. Keyword chips input
  const chipContainer = document.getElementById("keyword-chips-container");
  const chipInput = document.getElementById("keyword-chip-input");

  if (chipContainer && chipInput && hiddenKeywords) {
    let keywords = hiddenKeywords.value
      ? hiddenKeywords.value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
      : [];

    const addKeywordsFromText = (text) => {
      if (!text) return;
      const parts = text.split(/[,\s]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
      for (const val of parts) {
        if (val && !keywords.includes(val) && keywords.length < 10) {
          keywords.push(val);
        }
      }
      syncKeywords();
    };

    const renderChips = () => {
      chipContainer.querySelectorAll(".chip").forEach((c) => c.remove());
      keywords.forEach((kw, index) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = kw;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "chip-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", `Remove ${kw}`);
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          keywords.splice(index, 1);
          syncKeywords();
        });

        chip.appendChild(removeBtn);
        chipContainer.insertBefore(chip, chipInput);
      });
      hiddenKeywords.value = keywords.join(",");
      updatePreview();
    };

    const syncKeywords = () => {
      renderChips();
    };

    chipInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addKeywordsFromText(chipInput.value);
        chipInput.value = "";
      } else if (e.key === "Backspace" && !chipInput.value && keywords.length > 0) {
        keywords.pop();
        syncKeywords();
      }
    });

    chipInput.addEventListener("blur", () => {
      if (chipInput.value.trim()) {
        addKeywordsFromText(chipInput.value);
        chipInput.value = "";
      }
    });

    chipInput.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData("text");
      addKeywordsFromText(pasted);
    });

    const parentForm = chipContainer.closest("form");
    if (parentForm) {
      parentForm.addEventListener("submit", () => {
        if (chipInput.value.trim()) {
          addKeywordsFromText(chipInput.value);
          chipInput.value = "";
        }
      });
    }

    renderChips();
  }

  // Variable chip inserters
  const varChips = document.querySelectorAll(".var-chip");
  varChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!templateInput) return;
      const tag = chip.getAttribute("data-tag");
      const start = templateInput.selectionStart || templateInput.value.length;
      const end = templateInput.selectionEnd || templateInput.value.length;
      const text = templateInput.value;
      templateInput.value = text.substring(0, start) + tag + text.substring(end);
      templateInput.focus();
      templateInput.selectionStart = templateInput.selectionEnd = start + tag.length;
      updatePreview();
    });
  });

  // 5. Reel Picker
  const loadPickerBtn = document.getElementById("load-picker-btn");
  const pickerGrid = document.getElementById("picker-grid");
  const pickerLoading = document.getElementById("picker-loading");
  const pickerError = document.getElementById("picker-error");
  const mediaIdInput = document.getElementById("media-id-input");
  const captionSnippetInput = document.getElementById("caption-snippet-input");
  const thumbnailUrlInput = document.getElementById("thumbnail-url-input");
  const permalinkInput = document.getElementById("permalink-input");

  if (loadPickerBtn && pickerGrid) {
    loadPickerBtn.addEventListener("click", async () => {
      pickerGrid.innerHTML = "";
      pickerError.style.display = "none";
      pickerLoading.style.display = "block";
      loadPickerBtn.disabled = true;

      try {
        const res = await fetch("/admin/api/media", {
          headers: { Accept: "application/json" },
        });
        const json = await res.json();

        pickerLoading.style.display = "none";
        loadPickerBtn.disabled = false;

        if (!res.ok || json.error) {
          pickerError.textContent = json.error?.message || "Failed to load recent reels from Instagram.";
          pickerError.style.display = "block";
          return;
        }

        const items = json.data || [];
        if (items.length === 0) {
          pickerGrid.innerHTML = "<p style='color:var(--muted);font-size:13px;'>No recent reels found on Instagram.</p>";
          return;
        }

        items.forEach((item) => {
          const div = document.createElement("div");
          div.className = `picker-item ${item.hasRule ? "disabled" : ""}`;
          div.title = item.hasRule ? "This reel already has a rule" : (item.caption || "Reel");

          const thumb = item.thumbnailUrl
            ? `<img src="${item.thumbnailUrl}" alt="Thumbnail" />`
            : `<div style="height:100px;display:flex;align-items:center;justify-content:center;background:var(--border);">📹</div>`;

          div.innerHTML = `
            ${thumb}
            <div class="picker-caption">${item.hasRule ? "<strong>(Has Rule)</strong> " : ""}${item.caption || item.id}</div>
          `;

          if (!item.hasRule) {
            div.addEventListener("click", () => {
              pickerGrid.querySelectorAll(".picker-item").forEach((el) => el.classList.remove("selected"));
              div.classList.add("selected");
              if (mediaIdInput) mediaIdInput.value = item.id;
              if (captionSnippetInput) captionSnippetInput.value = (item.caption || "").slice(0, 150);
              if (thumbnailUrlInput) thumbnailUrlInput.value = item.thumbnailUrl || "";
              if (permalinkInput) permalinkInput.value = item.permalink || "";
            });
          }

          pickerGrid.appendChild(div);
        });
      } catch (err) {
        pickerLoading.style.display = "none";
        loadPickerBtn.disabled = false;
        pickerError.textContent = "Network error loading reels: " + err.message;
        pickerError.style.display = "block";
      }
    });
  }

  // 6. Test Link button
  const testLinkBtn = document.getElementById("test-link-btn");
  if (testLinkBtn && linkInput) {
    testLinkBtn.addEventListener("click", () => {
      const url = linkInput.value.trim();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  }

  // 7. Copy Callback URL button
  const copyCallbackBtn = document.getElementById("copy-callback-btn");
  const callbackUrlInput = document.getElementById("callback-url-input");
  if (copyCallbackBtn && callbackUrlInput) {
    copyCallbackBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(callbackUrlInput.value);
        const orig = copyCallbackBtn.textContent;
        copyCallbackBtn.textContent = "Copied!";
        setTimeout(() => {
          copyCallbackBtn.textContent = orig;
        }, 2000);
      } catch (err) {
        callbackUrlInput.select();
        document.execCommand("copy");
      }
    });
  }

  // 8. Confirmation dialogs for forms with data-confirm
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      const msg = form.getAttribute("data-confirm") || "Are you sure?";
      if (!window.confirm(msg)) {
        e.preventDefault();
      }
    });
  });

  // Initial preview render
  updatePreview();
});
