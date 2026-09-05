# imsend.ing

type something. it turns into pool balls. smack the cue.

key sounds are cherry mx black samples from [kbsim](https://github.com/tplai/kbsim).

## Run locally

`npm install`, then `npm run dev`. Open http://localhost:3000.

## Gallery

Save stores the typed **message and name**, plus an ID and timestamp. No screenshot,
ball positions, image file, or image-storage service is needed. Messages can contain
up to 500 graphemes (an emoji sequence counts as one). Names allow up to 20 letters,
numbers, spaces, and `@ . _ ' -` and display as subtly tilted black text.

Send opens the gallery immediately with a pending card and a retry option on
failure. The gallery loads 25 records at a time using a stable timestamp + UUID
cursor. Each square preview is rendered in the browser from the original text.
Mobile uses one column; desktop expands to five or more. Downloads generate a
high-quality PNG locally on demand in 1:1 (3200 × 3200), 3:4 (2400 × 3200),
or 9:16 (1800 × 3200); those images are never uploaded. Exports include a top-centered maker credit
and an imsend.ing mini-ball watermark at the bottom.

Opening a message goes to `/gallery/<id>` — a shareable link to a full-screen
playable table with typing disabled and a two-line `made by` credit. PLAY opens
your own blank table. Playing saved messages does not increment the typing metric. The main table's controls overlay the full
play area, and cue strength changes the aim line from faint black through yellow,
orange, and red.

Local gallery records live in the gitignored `data/messages/` directory. The old
screenshot prototype's `data/gallery/` files are left untouched; they do not appear
in the new gallery because they do not contain the original text. Cloud message
records likewise use a separate versioned namespace.

## Hosting

Deploy the existing Next.js app to Vercel with the existing
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. **No Vercel Blob store or
additional image-storage service is required.** Redeploy after changing environment
variables. The gallery uses `pools:messages:v1:*`; metrics still use `pools:letters`.
An optional `POOLS_GALLERY_KEY` changes the prefix before `:messages:v1`.

Vercel deployments always use Redis. Missing credentials show an unavailable state
instead of writing to a temporary filesystem. Local development stays separate;
set `GALLERY_STORAGE=cloud` to intentionally use the shared Redis gallery locally.
Use a distinct `POOLS_GALLERY_KEY` for isolated preview records.

The API validates names/messages, caps request bodies at 32 KB, limits submissions
to 20 per IP per hour, and uses submission IDs to avoid duplicates on retry. This
is an anonymous public gallery. These limits are basic abuse protection, not content
moderation. To remove an entry, delete its `pools:messages:v1:entry:<id>` record and
remove its `order` member from `pools:messages:v1:index`.

Vercel Hobby can host a personal, non-commercial version within its free usage
limits. Upstash's free tier includes 256 MB and 500,000 commands per month, shared
with anything else using that database. Message-only storage is much smaller than
images, but traffic and command limits still apply. Pricing checked September 5,
2026: [Vercel plans](https://vercel.com/pricing),
[Upstash Redis pricing](https://upstash.com/pricing/redis).
