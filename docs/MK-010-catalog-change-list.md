# MK-010 — catalog change list (revised)

Status: **not complete.** No backend writes have been made. This plan supersedes
the first version, which was wrong and would have made the catalog worse.

## Why the first plan was wrong

The first version read the audit's "gallery images vs colour variants" gap and
proposed adding colour variants until the counts matched. Inspecting the actual
variant rows shows that premise does not hold for this catalog:

**The variants are size runs, not colour runs.** Of the seventeen products in
question, thirteen carry one colour and a set of sizes:

| Product | Colours | Variant dimension actually in use |
|---|---:|---|
| 710988, 710989, 710991 | 1 | shoe sizes 36–41 |
| 711000 | 1 | sizes 28–35 |
| 711061, 710920, 710904, 710909, 710902 | 1 | XS · S · M · L · XL |
| 710940 | 1 | 0–3M · 3–6M · 6–12M · 12–18M · 18–24M |
| 710941, 710939 | 1 | 2Y · 3Y · 4Y · 5Y · 6Y |
| 710969 | 1 | four material types, three with no colour set |

Adding a colour to a size-run product does not add one variant — it adds a
whole second size run. Product 711000 would go from 8 variants to 16; 710988
from 6 to 12. That is precisely the "excessive variant list" the report warns
against, and it would have been done to satisfy a count.

**The extra gallery images are not colourways.** Reading the image filenames
one by one, the second and later images are alternate views, lifestyle
photographs, near-duplicates of the same source shot, or unrelated stock:

- `710991` — `womanshoesonwhitefreephsoto030` and `womanshoesonwhitedfreephoto030`:
  the same source photograph twice, with two different typos in the filename.
- `710961` — image 2 is `childholdingyounggreenplanthands`. Nothing to do with
  sunglasses.
- `710940` — `smilingteenagegirlblankwhiteshirtthumbsup` and
  `cutesmilinggirlwithcupcake`: two lifestyle shots, one garment.
- `710882` — six images across `black`, `darkblue` and front-view crops of the
  same two colourways. Three colour variants already exist.
- `710841` — five images, four of them the same black printer. Two colour
  variants already exist.

So for most rows the honest answer is that nothing is missing.

## Revised per-product plan

Each row states exactly one action.

| Product | Name | Images | Variants | Colours | Action | Reason |
|---|---|---:|---:|---:|---|---|
| 710969 | Pipo Leather Crossbody Bag | 1 | 4 | 1 | **Assign colours to existing variants** | Three variants carry a material type and no colour, so they render nothing. Give each a real colour, or merge them if they are one product. The one image is beige/teal while the only colour set is midnight blue — reconcile that too. |
| 710961 | Nakeye TR90 Unbreakable Polarized | 2 | 1 | 1 | **Merge/delete redundant demo media** | Image 2 is an unrelated stock photo of a child holding a plant. Remove it; usable count becomes 1 and already matches. |
| 710991 | Womens Fashion Canvas Sneakers | 2 | 6 | 1 | **Merge/delete redundant demo media** | Both images are the same source photograph. Remove the duplicate; usable count becomes 1 and already matches. |
| 711061 | Mountain Breeze Performance Tank Top | 3 | 5 | 1 | **Assign colour to an existing variant, or delete the odd image** | Image 3 is a grey vest; the size run is red. Either photograph the red, or split one size into grey — do not add a second full size run for one image. |
| 710882 | ProGo Extreme 4K | 6 | 3 | 3 | **No change** | Six images cover two photographed colourways plus alternate views. Three colour variants already exist; if anything, `#383838` has no photograph and could be dropped. |
| 710841 | PhotoMaster Professional Inkjet Printer | 5 | 2 | 2 | **No change** | Four of five images are the same black unit. Two colours already cover what is photographed. |
| 710988 | Womens flex Soft System | 2 | 6 | 1 | **No change** | Two views of one colourway over a 36–41 size run. |
| 710989 | Womens I Loyal Flat | 2 | 6 | 1 | **No change** | Two stock views, one colourway, 36–41 size run. |
| 711000 | Kids Walker Shoe | 2 | 8 | 1 | **No change** | `babyshoes2` and `closeupbabyshoe` are two views of one shoe. |
| 710956 | Doeynak Sunglasses UV400 | 2 | 1 | 1 | **No change** | Both images are lifestyle beach photographs, not colourways. |
| 710951 | Oynak Polarized Sunglasses UV | 2 | 1 | 1 | **No change** | One lifestyle shot plus one isolated product shot of the same frame. |
| 710944 | Eynak Black Retro UV | 2 | 1 | 1 | **No change** | Front view plus a chain-accessory view of the same frame. |
| 710940 | Mishkima Baby Knit T-shirt | 2 | 5 | 1 | **No change** | Two lifestyle photographs over an age-size run. |
| 710941 | Mishkima Toddler Ruffle Top | 2 | 5 | 1 | **No change** | Two lifestyle photographs over a 2Y–6Y size run. |
| 710939 | Mishkima Short Sleeve T-Shirt | 2 | 5 | 1 | **No change** | As above. |
| 710920 | Tangomix Short Sleeve Tops | 2 | 5 | 1 | **No change** | Two model photographs, one garment. |
| 710904 | Ofay Reflecting Rebel Shirred | 2 | 5 | 1 | **No change** | Two lifestyle photographs, one garment. |
| 710909 | Ofay Womens 2 Piece Bikini | 2 | 5 | 1 | **Exclude from promotions** | Already excluded by the eligibility guard. Listing and PDP unaffected. |
| 710902 | Ofay Sleeve Beach Shirt | 2 | 5 | 1 | **Exclude from promotions** | Already excluded by the eligibility guard. Listing and PDP unaffected. |

Totals: 1 assign-colours, 2 merge/delete media, 1 either-or, 13 no change,
2 excluded. **Zero products need a genuinely new variant created.**

## What was fixed in the storefront

These were real defects on this side and are done on
`claude/marketplace-redesign`. They do not close MK-010.

- A variant with no colour no longer renders a swatch. Product `710969` was
  showing four swatches for one navy variant plus three colourless material
  variants — three blank circles offering a choice that did not exist.
- A single colour renders no selector at all. One colour is not a choice.
- `#243B64` and `#243B64ff` collapse to one swatch. Grouping on the raw string
  had rendered the same colour twice — the duplicate pair found on `710897`.
- Swatch labels are colour names, not hex.
- The swatch row never wraps: five per line, remainder as `+N`.

## Recommendation on the underlying rule

"Distinct colour choices should equal usable gallery-image count" does not fit
this catalog, because the extra images are alternate and lifestyle views rather
than colourways. Applying it literally would multiply size runs.

The rule worth keeping is narrower and is what the storefront now enforces:
**every colour variant must be distinguishable, named, and backed by a real
colour value; and no variant may render as an empty swatch.** Image count is a
media-quality question, and the three media problems above are worth fixing on
their own merits.

## Before any catalog mutation

Nothing here has been written. Applying it needs a live Selldone MCP connection
(the one in this session dropped) and an explicit go-ahead per product, since
these are writes to a real catalog.
