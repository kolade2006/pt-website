// =========================================
// SITE CONFIGURATION
// =========================================

const MOBILE_BREAKPOINT = 768;


// =========================================
// YOUTUBE VIDEOS
// =========================================

/*
 * The homepage Latest Service card and the Catch Up gallery load the newest
 * uploads automatically from /api/youtube-videos.
 *
 * CHURCH_VIDEOS is the emergency fallback only. It is shown immediately while
 * the automatic request is in flight, and remains visible if the API is
 * temporarily unavailable. Keep one unique videoId per entry.
 *
 * The API's newest video is used for the homepage card; the same video is
 * first in the Catch Up gallery.
 */
const CHURCH_VIDEOS = [
    {
        videoId: "P45xzgpjUAI",
        title: "ARE YOU GOD’S LIGHT|| PRAISE SERVICE SUNDAY 8TH NOVEMBER 2026 WITH PASTOR KAYODE AKINTOLU"
    },
    {
        videoId: "shQrRuTTGeo",
        title: "EXCELLENCE IN THE MARKET || FAMILY WEEKEND –5TH NOVEMBER 2026 WITH BRO CLETUS"
    },
    {
        videoId: "BQieGWpv9Mw",
        title: "THE REALITY OF DIVINE RELATION (2) || DIGGING DEEP SERVICE –27TH OCTOBER 2026 WITH PASTOR BAMIDELE"
    },
    {
        videoId: "pHZJLWGatbg",
        title: "WHOSE SERVANT ARE YOU || DIGGING DEEP SERVICE –10TH NOVEMBER 2026 WITH  DCN. STEPHEN AIDEH"
    },
    {
        videoId: "jQzNJ7VvlH8",
        title: "DIVINE ASSISTANCE OVER RESISTANCE || FIRST SERVICE SUNDAY 8TH NOVEMBER 2026 WITH PASTOR BAMIDELE"
    },
    {
        videoId: "L--GXfH1WQM",
        title: "WALK IN HIS LIGHT AS HE IS IN THE LIGHT || DIGGING DEEP SERVICE –3RD NOVEMBER 2026 WITH DCNS.TESSY"
    },
    {
        videoId: "bmB9WQTVoXQ",
        title: "ACTIVATING YOUR POTENTIALS || NOVEMBER 2026 THANKSGIVING SERVICE WITH DADDY G.O"
    },
    {
        videoId: "_n1bOxgZPPk",
        title: "DIVINE ALIGNMENT WITH THE RIGHT PEOPLE || FAITH CLINIC SERVICE – 29TH OCTOBER 2026 WITH DCNS. TESSY"
    }
];


// =========================================
// NAVIGATION
// =========================================

const menuToggle = document.getElementById("menu-toggle");
const mainNavigation = document.getElementById("main-navigation");

function isMobileLayout() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function closeDropdowns(except) {
    document.querySelectorAll(".nav-dropdown-wrap.open").forEach(function (wrap) {
        if (wrap === except) {
            return;
        }

        wrap.classList.remove("open");

        const toggle = wrap.querySelector(".nav-dropdown-toggle");

        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }
    });
}

function openMenu() {
    if (!menuToggle || !mainNavigation) {
        return;
    }

    mainNavigation.classList.add("open");
    menuToggle.classList.add("active");
    document.body.classList.add("menu-open");

    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close navigation menu");
}

function closeMenu() {
    if (!menuToggle || !mainNavigation) {
        return;
    }

    mainNavigation.classList.remove("open");
    menuToggle.classList.remove("active");
    document.body.classList.remove("menu-open");

    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation menu");

    closeDropdowns();
}


// Open / close the full-screen mobile menu

if (menuToggle && mainNavigation) {

    menuToggle.addEventListener("click", function () {
        const menuIsOpen = mainNavigation.classList.contains("open");

        if (menuIsOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });


    // Close the mobile menu when a navigation link is selected

    mainNavigation.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
            closeDropdowns();

            if (isMobileLayout()) {
                closeMenu();
            }
        });
    });


    // Close the mobile menu when the dark background is clicked

    mainNavigation.addEventListener("click", function (event) {
        if (event.target === mainNavigation) {
            closeMenu();
        }
    });


    // Close the menu when the layout switches between mobile and desktop

    let lastMobileLayout = isMobileLayout();

    window.addEventListener("resize", function () {
        const mobileNow = isMobileLayout();

        if (mobileNow !== lastMobileLayout) {
            closeMenu();
            closeDropdowns();
            lastMobileLayout = mobileNow;
        }
    });
}


// =========================================
// NAVIGATION DROPDOWN
// =========================================

const dropdownToggles = document.querySelectorAll(".nav-dropdown-toggle");

dropdownToggles.forEach(function (toggle) {
    toggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const wrap = toggle.closest(".nav-dropdown-wrap");

        if (!wrap) {
            return;
        }

        const willOpen = !wrap.classList.contains("open");

        closeDropdowns(wrap);
        wrap.classList.toggle("open", willOpen);
        toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
});


// Close the dropdown when clicking anywhere outside it

document.addEventListener("click", function (event) {
    if (!event.target.closest(".nav-dropdown-wrap")) {
        closeDropdowns();
    }
});


// Close the menu and dropdown with the Escape key

document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
        return;
    }

    closeDropdowns();

    if (mainNavigation && mainNavigation.classList.contains("open")) {
        closeMenu();
    }
});


// =========================================
// AUTOMATIC COPYRIGHT YEAR
// =========================================

const currentYear = document.getElementById("current-year");

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}


// =========================================
// HOMEPAGE EVENT CAROUSEL
// =========================================

// Initialise one carousel. The same function powers the homepage hero
// carousel and the Upcoming Events carousel on the Watch & Events page.
function setupEventCarousel(carousel) {
    if (!carousel) {
        return;
    }

    const track = carousel.querySelector("[data-carousel-track]");
    const dotsWrap = carousel.querySelector("[data-carousel-dots]");
    const prevButton = carousel.querySelector("[data-carousel-prev]");
    const nextButton = carousel.querySelector("[data-carousel-next]");

    if (!track) {
        return;
    }

    const slides = Array.from(track.children);

    if (slides.length === 0) {
        return;
    }

    const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const AUTOPLAY_INTERVAL = 5500;
    const total = slides.length;

    let position = 1;
    let autoplayTimer = null;
    let isPaused = false;
    let pointerStartX = null;

    // Clone the first and last slides so the movement loops seamlessly.
    if (total > 1) {
        const firstClone = slides[0].cloneNode(true);
        const lastClone = slides[total - 1].cloneNode(true);

        firstClone.setAttribute("aria-hidden", "true");
        lastClone.setAttribute("aria-hidden", "true");
        firstClone.classList.add("carousel-clone");
        lastClone.classList.add("carousel-clone");

        track.appendChild(firstClone);
        track.insertBefore(lastClone, slides[0]);
    }

    function moveTrack(pos, animate) {
        if (!animate) {
            track.style.transition = "none";
        }

        track.style.transform = "translateX(-" + pos * 100 + "%)";

        if (!animate) {
            void track.offsetWidth;
            track.style.transition = "";
        }
    }

    function setActiveDot(realIndex) {
        if (!dotsWrap) {
            return;
        }

        dotsWrap.querySelectorAll(".carousel-dot").forEach(function (dot, index) {
            const isActive = index === realIndex;

            dot.classList.toggle("is-active", isActive);

            if (isActive) {
                dot.setAttribute("aria-current", "true");
            } else {
                dot.removeAttribute("aria-current");
            }
        });
    }

    function realIndexFromPosition() {
        if (position === 0) {
            return total - 1;
        }

        if (position === total + 1) {
            return 0;
        }

        return position - 1;
    }

    function updateDots() {
        setActiveDot(realIndexFromPosition());
    }

    function goToPosition(pos) {
        position = pos;
        moveTrack(position, true);
        updateDots();
    }

    function nextSlide() {
        if (total < 2) {
            return;
        }

        goToPosition(position + 1);
    }

    function previousSlide() {
        if (total < 2) {
            return;
        }

        goToPosition(position - 1);
    }

    // Build the pagination dots.
    if (dotsWrap && total > 1) {
        dotsWrap.innerHTML = "";

        for (let index = 0; index < total; index += 1) {
            const dot = document.createElement("button");

            dot.type = "button";
            dot.className = "carousel-dot";
            dot.setAttribute("aria-label", "Show event photo " + (index + 1));

            if (index === 0) {
                dot.classList.add("is-active");
                dot.setAttribute("aria-current", "true");
            }

            dot.addEventListener("click", function () {
                goToPosition(index + 1);
                restartAutoplay();
            });

            dotsWrap.appendChild(dot);
        }
    }

    // After the cloned slides finish moving, jump back to the real slide.
    track.addEventListener("transitionend", function () {
        if (position === 0) {
            position = total;
            moveTrack(position, false);
        } else if (position === total + 1) {
            position = 1;
            moveTrack(position, false);
        }
    });

    if (prevButton) {
        prevButton.addEventListener("click", function () {
            previousSlide();
            restartAutoplay();
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", function () {
            nextSlide();
            restartAutoplay();
        });
    }

    // Keyboard controls when the carousel has focus.
    carousel.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            previousSlide();
            restartAutoplay();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nextSlide();
            restartAutoplay();
        }
    });

    // Swipe support for touch screens.
    carousel.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "mouse") {
            return;
        }

        pointerStartX = event.clientX;
    });

    carousel.addEventListener("pointerup", function (event) {
        if (pointerStartX === null) {
            return;
        }

        const distance = event.clientX - pointerStartX;
        pointerStartX = null;

        if (Math.abs(distance) < 40) {
            return;
        }

        if (distance < 0) {
            nextSlide();
        } else {
            previousSlide();
        }

        restartAutoplay();
    });

    carousel.addEventListener("pointercancel", function () {
        pointerStartX = null;
    });

    // Pause autoplay while the visitor is interacting with the carousel.
    function startAutoplay() {
        if (prefersReducedMotion || total < 2) {
            return;
        }

        stopAutoplay();

        autoplayTimer = window.setInterval(function () {
            if (!isPaused && !document.hidden) {
                nextSlide();
            }
        }, AUTOPLAY_INTERVAL);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            window.clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    function restartAutoplay() {
        startAutoplay();
    }

    carousel.addEventListener("mouseenter", function () {
        isPaused = true;
    });

    carousel.addEventListener("mouseleave", function () {
        isPaused = false;
    });

    carousel.addEventListener("focusin", function () {
        isPaused = true;
    });

    carousel.addEventListener("focusout", function () {
        isPaused = false;
    });

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            stopAutoplay();
        } else {
            startAutoplay();
        }
    });

    // Start on the first real slide (the first item is the clone of the last).
    moveTrack(1, false);
    updateDots();
    startAutoplay();
}


// =========================================
// YOUTUBE VIDEO INTEGRATION
// =========================================

function buildVideo(video, index) {
    const videoId = String(video.videoId || video.id || "").trim();

    if (!videoId) {
        return null;
    }

    const title = video.title || "Church service video " + (index + 1);
    const sources = [
        video.thumbnail,
        video.thumbnailFallback,
        "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg",
        "https://i.ytimg.com/vi/" + videoId + "/hq720.jpg",
        "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
    ].filter(Boolean);

    return {
        videoId: videoId,
        title: title,
        url: video.url || "https://www.youtube.com/watch?v=" + videoId,
        thumbnails: sources.filter(function (source, sourceIndex) {
            return sources.indexOf(source) === sourceIndex;
        })
    };
}

// Try high resolution first, then fall back to the reliable standard image.
// If every source fails the error is shown in the card rather than leaving a
// silent broken image.
function applyVideoThumbnail(card, image, video, isLatestCard) {
    let sourceIndex = 0;

    image.alt = video.title + " — YouTube thumbnail";
    image.hidden = false;

    image.onerror = function () {
        sourceIndex += 1;

        if (sourceIndex < video.thumbnails.length) {
            image.src = video.thumbnails[sourceIndex];
            return;
        }

        image.onerror = null;
        image.hidden = true;
        card.classList.remove("has-video");
        card.classList.add("has-thumbnail-error");

        if (isLatestCard) {
            const fallbackNote = card.querySelector(".watch-video-fallback-note");

            if (fallbackNote) {
                fallbackNote.textContent =
                    "Thumbnail unavailable. Click to open this service on YouTube.";
            }
        } else {
            const fallbackTitle = card.querySelector(".video-fallback-title");

            if (fallbackTitle) {
                fallbackTitle.textContent =
                    "Thumbnail unavailable — click to watch";
            }
        }
    };

    image.src = video.thumbnails[0];
    card.classList.add("has-video");
    card.classList.remove("has-thumbnail-error");
}

function hydrateLatestVideoCard(card, video) {
    const image = card.querySelector("[data-video-thumbnail]");
    const title = card.querySelector("[data-video-title]");

    card.href = video.url;
    card.setAttribute("data-video-id", video.videoId);

    if (title) {
        title.textContent = video.title;
        title.title = video.title;
    }

    if (image) {
        applyVideoThumbnail(card, image, video, true);
    }
}

function hydrateVideoCard(card, video) {
    const image = card.querySelector("[data-video-thumbnail]");
    const title = card.querySelector("[data-video-title]");

    card.href = video.url;
    card.setAttribute("data-video-id", video.videoId);

    if (title) {
        title.textContent = video.title;
        title.title = video.title;
    }

    if (image) {
        applyVideoThumbnail(card, image, video, false);
    }
}

function applyVideos(videoList) {
    const latestCard = document.querySelector("[data-latest-video]");
    const galleryCards = Array.from(
        document.querySelectorAll("[data-video-card]")
    );
    const videos = (videoList || []).map(buildVideo).filter(Boolean);

    if (videos.length === 0) {
        return false;
    }

    if (latestCard) {
        hydrateLatestVideoCard(latestCard, videos[0]);
    }

    galleryCards.forEach(function (card, index) {
        const video = videos[index];

        if (!video) {
            card.hidden = true;
            card.setAttribute("aria-hidden", "true");
            return;
        }

        card.hidden = false;
        card.removeAttribute("aria-hidden");
        hydrateVideoCard(card, video);
    });

    return true;
}

function applyCuratedVideos() {
    return applyVideos(CHURCH_VIDEOS);
}

async function loadAutomaticVideos() {
    try {
        const response = await fetch("/api/youtube-videos?limit=8", {
            headers: { Accept: "application/json" }
        });
        const payload = await response.json();

        if (
            !response.ok ||
            !payload.ok ||
            !Array.isArray(payload.videos) ||
            payload.videos.length === 0
        ) {
            throw new Error(
                (payload && payload.message) || "No videos were returned."
            );
        }

        applyVideos(payload.videos);
    } catch (error) {
        // The curated fallback is already on screen. Never leave empty cards.
        console.warn(
            "[youtube] Automatic video feed unavailable; using fallback.",
            error
        );
        applyCuratedVideos();
    }
}


// =========================================
// GOOGLE MAPS EMBED
// =========================================

function initMapEmbed() {
    const frame = document.querySelector("[data-map-frame]");

    if (!frame) {
        return;
    }

    const source = (frame.getAttribute("data-map-src") || "").trim();

    if (!source || !/^https:\/\//i.test(source)) {
        return;
    }

    const iframe = document.createElement("iframe");

    iframe.src = source;
    iframe.title = frame.getAttribute("data-map-title") || "Church location map";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.allowFullscreen = true;

    const placeholder = frame.querySelector("[data-map-placeholder]");

    // Keep the fallback visible behind the iframe until the map has loaded.
    iframe.addEventListener("load", function () {
        if (placeholder) {
            placeholder.remove();
        }
    }, { once: true });

    frame.appendChild(iframe);
}


// =========================================
// CONTACT FORM
// =========================================

function initContactForm() {
    const form = document.getElementById("contact-form");

    if (!form) {
        return;
    }

    const submitButton = document.getElementById("contact-submit");
    const submitLabel = submitButton
        ? submitButton.querySelector(".contact-submit-label")
        : null;
    const notice = document.getElementById("form-notice");
    const startedAt = document.getElementById("form-started-at");

    let isSubmitting = false;

    if (startedAt) {
        startedAt.value = String(Date.now());
    }

    function setNotice(message, state) {
        if (!notice) {
            return;
        }

        notice.textContent = message;
        notice.className = "form-notice" + (state ? " is-" + state : "");
    }

    function clearFieldErrors() {
        form.querySelectorAll(".is-invalid").forEach(function (field) {
            field.classList.remove("is-invalid");
            field.removeAttribute("aria-invalid");
            field.removeAttribute("aria-describedby");
        });

        form.querySelectorAll(".form-error").forEach(function (error) {
            error.remove();
        });
    }

    function showFieldError(field, message) {
        if (!field) {
            return;
        }

        field.classList.add("is-invalid");
        field.setAttribute("aria-invalid", "true");

        const error = document.createElement("span");
        error.className = "form-error";
        error.id = field.id + "-error";
        error.textContent = message;

        field.setAttribute("aria-describedby", error.id);
        field.insertAdjacentElement("afterend", error);
    }

    function countDigits(value) {
        return (value.match(/\d/g) || []).length;
    }

    function validate(values) {
        let firstInvalid = null;

        function fail(field, message) {
            showFieldError(field, message);

            if (!firstInvalid) {
                firstInvalid = field;
            }
        }

        const fullName = document.getElementById("full-name");
        const email = document.getElementById("email");
        const phone = document.getElementById("phone");
        const subject = document.getElementById("subject");
        const message = document.getElementById("message");

        if (values.fullName.trim().length < 2) {
            fail(fullName, "Please enter your full name.");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
            fail(email, "Please enter a valid email address.");
        }

        if (values.phone.trim()) {
            const validPhoneCharacters = /^[+()\d\s-]+$/.test(values.phone.trim());
            const digitCount = countDigits(values.phone);

            if (!validPhoneCharacters || digitCount < 7 || digitCount > 15) {
                fail(phone, "Please enter a valid phone number.");
            }
        }

        if (values.subject.trim().length < 2) {
            fail(subject, "Please add a subject.");
        }

        if (values.message.trim().length < 10) {
            fail(message, "Please write a message of at least 10 characters.");
        }

        return firstInvalid;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        clearFieldErrors();

        const formData = new FormData(form);

        const values = {
            fullName: String(formData.get("fullName") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            phone: String(formData.get("phone") || "").trim(),
            subject: String(formData.get("subject") || "").trim(),
            message: String(formData.get("message") || "").trim(),
            website: String(formData.get("website") || "").trim(),
            startedAt: Number(formData.get("startedAt")) || 0
        };

        // Hidden honeypot field: genuine visitors never fill this in.
        if (values.website) {
            setNotice("Your message could not be sent. Please try again.", "error");
            return;
        }

        const firstInvalid = validate(values);

        if (firstInvalid) {
            setNotice("Please correct the highlighted fields and try again.", "error");
            firstInvalid.focus();
            return;
        }

        isSubmitting = true;

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.classList.add("is-loading");
            submitButton.setAttribute("aria-busy", "true");
        }

        if (submitLabel) {
            submitLabel.textContent = "Sending...";
        }

        setNotice("Sending your message...", "loading");

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify(values)
            });

            let data = null;

            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }

            if (!response.ok) {
                const serverMessage = data && typeof data.message === "string"
                    ? data.message
                    : "";

                if (serverMessage) {
                    setNotice(serverMessage, "error");
                } else {
                    setNotice(
                        "Sorry, we could not send your message right now. " +
                        "Please try again in a moment or reach us through our social media pages.",
                        "error"
                    );
                }

                return;
            }

            const successMessage = data && data.devMode
                ? data.message
                : "Thank you! Your message has been sent. We will get back to you soon.";

            setNotice(successMessage, "success");
            form.reset();

            if (startedAt) {
                startedAt.value = String(Date.now());
            }
        } catch (error) {
            setNotice(
                "Sorry, we could not reach the message service. " +
                "Please check your connection and try again.",
                "error"
            );
        } finally {
            isSubmitting = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.classList.remove("is-loading");
                submitButton.removeAttribute("aria-busy");
            }

            if (submitLabel) {
                submitLabel.textContent = "Send Message";
            }
        }
    });
}


// =========================================
// INITIALISE
// =========================================

document.querySelectorAll("[data-carousel]").forEach(function (carousel) {
    setupEventCarousel(carousel);
});
initMapEmbed();
initContactForm();
applyCuratedVideos();
loadAutomaticVideos();
