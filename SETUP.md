# Praise Tabernacle Website - Setup Guide

This guide covers the new features added to the website, the contact-form
backend, and every placeholder that needs real church content.

The website itself remains plain HTML, CSS and JavaScript. The backend is two
small serverless functions in `api/`, with **no npm dependencies**.

---

## 1. What was added

| Feature | Where |
| --- | --- |
| Automatic event photo carousel | `homepage.html` (top of the page) and `watch-events.html` (Upcoming Events) |
| Three-column Sunday / Weekday / Special service schedule | `homepage.html` and `watch-events.html` (identical markup) |
| Automatic latest YouTube video | `homepage.html` Watch Live section + `/api/youtube-videos` |
| Church address | Footer on all four pages |
| Meet Our Pastors (three portraits) | `about.html` (after Mission & Vision) |
| Catch Up video gallery (8 videos, 4 per row) | `watch-events.html` (after the online section) |
| Catch Up navigation item | Watch & Events dropdown on all pages |
| Verified Google Maps embed | `contacts.html` (form left, tall map right, above the footer) |
| Working contact form | `contacts.html` + `api/contact.js` |
| Automatic YouTube video feed | `api/youtube-videos.js` |

---

## 2. Local preview

The contact form needs the included development server because the Python
`http.server` cannot run API routes.

```bash
npm run dev
```

Then open:

```
http://localhost:5503
```

In development mode the form validates submissions and writes them to
`.dev/contact-messages.jsonl`. It deliberately reports that no email or
database delivery was attempted. Set `CONTACT_DEV_MODE=false` in `.env` to test
real delivery.

A plain static preview still works for every page, but the form will show an
honest "could not send" message until the API is running.

---

## 3. Hosting and deployment

The project has no existing hosting configuration and is a static site, so the
recommended deployment is **Vercel**:

1. Push the project folder to GitHub.
2. Import the repository in Vercel.
3. Framework preset: **Other**. No build command is needed.
4. Add the environment variables from `.env.example` in
   **Project Settings -> Environment Variables**.
5. Deploy. Vercel serves the HTML/CSS/JS files and automatically exposes
   `api/contact.js` and `api/youtube-videos.js`. The included `vercel.json`
   rewrites `/` to `homepage.html` and adds basic security headers.

The same functions run on any Node 18+ host that supports the `(req, res)`
handler shape. Netlify would require moving them to `netlify/functions` and
adding redirects; Vercel needs no restructuring.

---

## 4. Contact form backend

### 4.1 Email delivery with Resend

1. Create a free account at <https://resend.com>.
2. Add and verify the church domain under **Domains**.
3. Create an API key under **API Keys**.
4. Set:
   - `RESEND_API_KEY`
   - `CONTACT_FROM_EMAIL` (for example
     `Praise Tabernacle <website@churchdomain.org>`)
   - `CHURCH_EMAIL` (the church's receiving inbox). `CONTACT_TO_EMAIL` is still
     accepted as an older alias.
5. For initial testing only, Resend's `onboarding@resend.dev` sender can be
   used, but it can only send to the email address that owns the Resend
   account. Use a verified domain for production.

Every message is sent as a formatted HTML email with a plain-text fallback.
The visitor's email address is used as `Reply-To`, so the church can reply
directly. If `CHURCH_EMAIL` or `CONTACT_FROM_EMAIL` still contains a placeholder
such as `example.com`, the backend treats email as unconfigured instead of
attempting delivery.

### 4.2 Message storage with Supabase

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. From **Project Settings -> API**, copy:
   - Project URL -> `SUPABASE_URL`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

Use the service-role key **only** in server environment variables. It must
never appear in `script.js` or any HTML file. Row Level Security is enabled and
no public policies exist, so visitors cannot read other people's messages. The
church can review submissions in the Supabase Table Editor.

The table stores name, email, phone, subject, message, submission time
(`created_at`), status (`unread` / `read` / `archived`) and a source label.

### 4.3 WhatsApp notifications (optional)

The backend can notify a church WhatsApp number through the **WhatsApp Business
Cloud API**.

Requirements:

1. A Meta Business account and a WhatsApp Business app.
2. A WhatsApp Business phone number ID and a permanent access token.
3. A destination number in international format, digits only.
4. For notifications outside the 24-hour customer service window, an approved
   message template is required. The backend expects a template with three body
   parameters:

   - `{{1}}` visitor name
   - `{{2}}` subject
   - `{{3}}` email address

Set:

```env
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TO_NUMBER=2348XXXXXXXXX
WHATSAPP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=en
```

If `WHATSAPP_TEMPLATE_NAME` is empty, the backend sends a plain text message.
That only works inside the 24-hour service window, so it is suitable for
testing, not for guaranteed notifications. WhatsApp is always optional and
never blocks a valid email or database submission.

A manual alternative is available on the Contact page: the WhatsApp contact
row is a clearly marked placeholder. Replace it with a `https://wa.me/...` link
once the church number is confirmed. It does not replace email delivery.

### 4.4 How the endpoint behaves

`POST /api/contact` accepts JSON:

```json
{
  "fullName": "Visitor name",
  "email": "visitor@example.com",
  "phone": "+234...",
  "subject": "Enquiry",
  "message": "The full message",
  "website": "",
  "startedAt": 1700000000000
}
```

Responses:

- `200` - message was emailed and/or stored.
- `400` - validation or spam check failed.
- `429` - too many submissions from the same IP.
- `502` - delivery was attempted but failed.
- `503` - no delivery channel is configured.

The frontend only shows a success message when the API returns `200`. It shows
a clear error otherwise and never pretends a failed message was sent.

Security measures:

- Server-side validation and length limits.
- Email and phone format validation.
- Hidden honeypot field.
- Minimum completion time.
- Rate limiting (3 submissions per minute per IP).
- Secrets only in environment variables.
- HTML escaping in notification emails.
- Supabase RLS with no public policies.

---

## 5. YouTube integration

### 5.1 What happens automatically

`api/youtube-videos.js` uses the official **YouTube Data API v3** when
`YOUTUBE_API_KEY` is configured:

1. `channels.list` resolves the church handle
   `@praisetabernacleogombo` (or `YOUTUBE_CHANNEL_ID`) and reads the channel's
   uploads playlist.
2. `playlistItems.list` retrieves the latest uploads newest first.
3. `videos.list` checks each candidate's status, so private, deleted or
   unprocessed videos are excluded.
4. Active and scheduled livestreams are skipped so they are not shown as
   completed previous services.

The API returns up to eight public videos. The homepage Latest Service card
uses the first one, and the Catch Up gallery uses the same ordered list. If the
channel has fewer than eight eligible videos, only those videos are shown;
surplus cards are hidden rather than filled with invented content.

Results are cached by the function for **30 minutes**. Vercel's CDN also
receives a 30-minute cache header, so normal page visits do not call YouTube on
every request. A newly uploaded video appears after the cache expires.

Reliability order:

1. Fresh Data API v3 results.
2. The last successful cached result, if the API is temporarily unavailable.
3. The public RSS feed if the API has no usable data.
4. The curated `CHURCH_VIDEOS` fallback in `script.js`.

The frontend never receives the API key. It only calls
`/api/youtube-videos?limit=8`.

### 5.2 Create a YouTube API key

1. Open <https://console.cloud.google.com/> and create or select a project.
2. Go to **APIs & Services -> Library**.
3. Search for **YouTube Data API v3**, open it and click **Enable**.
4. Go to **APIs & Services -> Credentials -> Create credentials -> API key**.
5. Copy the key. Under **API restrictions**, restrict it to
   **YouTube Data API v3** only.
6. Do not paste the key into `script.js`, HTML or any public file.

The default channel handle is:

```text
praisetabernacleogombo
```

The resolved channel ID is:

```text
UCVRMUU9ygtCbnBRjeH8b37w
```

Setting `YOUTUBE_CHANNEL_ID` is optional. It avoids a handle lookup on a cold
start but does not change which videos are shown.

### 5.3 Add the key locally

Create a `.env` file from `.env.example` and set:

```bash
YOUTUBE_CHANNEL_HANDLE=praisetabernacleogombo
YOUTUBE_CHANNEL_ID=UCVRMUU9ygtCbnBRjeH8b37w
YOUTUBE_API_KEY=your-real-key
```

Then restart the development server:

```bash
npm run dev
```

Test the endpoint:

```bash
curl "http://localhost:5503/api/youtube-videos?limit=8"
```

A successful official API response starts with:

```json
{
  "ok": true,
  "source": "youtube-api",
  "channelId": "UCVRMUU9ygtCbnBRjeH8b37w",
  "videos": []
}
```

Without a key, `source` is `rss-fallback`. That path is a resilience fallback,
not a substitute for verifying the official API setup.

### 5.4 Add the key to Vercel

1. Open the project in Vercel.
2. Go to **Settings -> Environment Variables**.
3. Add `YOUTUBE_API_KEY` with the real key.
4. Optionally add `YOUTUBE_CHANNEL_HANDLE` and `YOUTUBE_CHANNEL_ID`.
5. Save and redeploy.

After deployment, open:

```text
https://your-domain.com/api/youtube-videos?limit=8
```

Confirm that it returns `"source": "youtube-api"`, a real channel ID, real
titles and eight distinct video IDs. Then open the homepage and Watch & Events
page to confirm that the newest video and gallery match that response.

### 5.5 Response shape

```json
{
  "ok": true,
  "channelUrl": "https://youtube.com/@praisetabernacleogombo",
  "channelId": "UCVRMUU9ygtCbnBRjeH8b37w",
  "source": "youtube-api",
  "stale": false,
  "cachedAt": "2026-01-01T10:00:00.000Z",
  "cacheTtlSeconds": 1800,
  "videos": [
    {
      "id": "VIDEO_ID",
      "title": "Video title",
      "published": "2026-01-01T10:00:00+00:00",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "thumbnail": "https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg",
      "thumbnailFallback": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg"
    }
  ]
}
```

`stale: true` means the last cached result was served after a refresh failure.
The frontend keeps those cards visible instead of showing an empty gallery.

### 5.6 Curated fallback list

`CHURCH_VIDEOS` at the top of `script.js` is now only the emergency fallback.
It is displayed immediately while the API request is in flight, and remains
visible if the API is unavailable. It no longer controls the normal video
selection.

Each card tries the API thumbnail, then `maxresdefault.jpg`, then `hq720.jpg`,
then `hqdefault.jpg`. If every source fails, a visible "Thumbnail unavailable"
message appears instead of a broken image.

---

## 6. Placeholders to replace

### Event carousel - `homepage.html`

Five slides are marked `EVENT PHOTO 1` to `EVENT PHOTO 5`. Replace each
`<div class="carousel-placeholder ...">` with:

```html
<img src="event-photo-1.jpg" alt="Description of the event">
```

To add a slide, duplicate one `<article class="carousel-slide">` block. The
dots, arrows, autoplay and swipe support pick it up automatically.

### Service schedule - `homepage.html` and `watch-events.html`

The same markup appears on both pages, and the two copies must stay identical.
Update both at the same time. Each row is a single line with the service name,
a dash and the time:

```html
<li>
  <span class="service-name">Sunday Worship Service</span>
  <span class="service-separator" aria-hidden="true">&ndash;</span>
  <span class="service-time">9:00 AM</span>
</li>
```

The three columns are `Sunday`, `Weekdays` and `Special Services`. Replace the
placeholder names and `Time to be confirmed` values with the confirmed
schedule. The number of list items can be changed freely.

### Latest YouTube video - `homepage.html`

Automatic once the API is deployed. To pin one specific video manually, set the
card's `href` to the video URL and add `data-video-id="VIDEO_ID"`.

### Church address - footer on all pages

The footer currently uses the publicly listed address for RCCG Praise
Tabernacle Ogombo:

```
Ogunremi Street, Ogombo,
Eti-Osa, Lagos, Nigeria.
```

Confirm this wording with the church office and update all four footers if it
changes. The Contact page location card repeats the same address.

### Pastors - `about.html`

For each profile, replace the `.pastor-photo-placeholder` element with:

```html
<img src="pastor-name.jpg" alt="Pastor's name">
```

Then replace the role, name and biography text. Keep the order: Pastor,
Pastor's Wife, Assistant Pastor.

### Catch Up gallery - `watch-events.html`

The gallery updates automatically from `/api/youtube-videos`. Each card shows
its real YouTube title above a 16:9 thumbnail with a red play button and links
to its own individual video. Desktop uses four columns and two rows, tablet
uses two columns, and mobile uses one column.

The eight cards are the emergency fallback structure. The API fills them in
order and hides any surplus cards if fewer than eight public videos are
available. To update the fallback, edit `CHURCH_VIDEOS` in `script.js` and keep
the static `href` and `data-video-id` values in the same order.

### Google Maps - `contacts.html`

The map now points to the verified Google Maps listing for **RCCG Praise
Tabernacle Ogombo**, CJX6+57Q, Ogunremi St, Eti-Osa, Lagos. The embed is built
from the listing name and address, so it stays correct without an API key.

To swap in a different pin later:

1. Open the place on Google Maps.
2. Choose **Share -> Embed a map -> Copy HTML**.
3. Copy only the URL inside `src="..."`.
4. Paste it into `data-map-src=""` on the `.map-frame` element.

The script builds the iframe automatically. An `https://` URL is required.

### Contact form configuration

Set `CHURCH_EMAIL` and `CONTACT_FROM_EMAIL` in the hosting dashboard with the
real church email addresses. Never put them in the HTML.

---

## 7. Verification checklist

Tested locally with the development server:

- Both carousels autoplay and support previous/next arrows, dots, keyboard
  arrows and swipe.
- The service schedule renders as three centered columns with a short rule
  above each heading, and is identical on the Home and Watch & Events pages.
- Watch Live card keeps its 16:9 area and falls back cleanly.
- Footer address appears below the logo and church name.
- Three pastor portraits render in the required order with names below.
- Eight gallery cards render 4x2 on desktop, 2 columns on tablet and one
  column on mobile, with titles above thumbnails.
- All eight thumbnails load at 1280x720 and every card links to its own video.
- The homepage latest card follows the first video returned by the API.
- Catch Up dropdown link jumps to `#catch-up`.
- The verified Google Maps listing loads responsively beside the contact form
  on desktop, stacks below it on smaller screens, and the placeholder remains
  visible until the map is ready.
- Contact form validation, loading state, success and error states.
- Invalid submissions are rejected by the API.
- Duplicate submissions are prevented while a request is in flight.
- The form never reports success when the API returns an error.

Lighthouse (Accessibility, Best Practices, SEO) should be re-run after the final
content is added, because real images, names and addresses will change the
audit results.
