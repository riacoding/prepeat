# 📄 Menu Data Contract & Admin Workflow

## Core Identity
- **`locationId`**
  - Unique identifier for a menu’s serving location.
  - Used as the **SMS code**: when a user texts a `locationId`, the system looks up the associated menu.
  - **Rule:** At any given time, there must be **at most one `Menu` per `locationId` with `isActive = true`**.

---

## State Flags
- **`isActive: boolean`**
  - **Published flag**: the menu is available for discovery.
  - If `false`: menu is unpublished → must never be returned in SMS lookups or web entry points.
  - If `true`: this is the canonical menu for its `locationId`.

- **`isOffline: boolean`**
  - **Availability flag**: indicates whether the active menu is currently serving.
  - If `false`: menu is live and should be returned normally.
  - If `true`: menu is still the active one, but temporarily unavailable (e.g., too busy, sold out, closed for the day).
  - In SMS/web responses, return a **friendly “offline/unavailable” message** rather than the link.

---

## Invariants (Must Always Be True)
1. **Single active menu per location**
   - For each `locationId`, at most one `Menu` may have `isActive = true`.
   - Admin logic should enforce this when publishing/unpublishing menus.
2. **Unpublished menus**
   - `isActive = false` → not discoverable via SMS, links, or APIs.
3. **Offline menus**
   - `isActive = true && isOffline = true` → discoverable, but responses must indicate “temporarily offline” instead of showing menu items.
4. **SMS Contract**
   - **Input:** user texts a `locationId`.
   - **Lookup:** query `Menu` by `locationId`.
   - **Output:**
     - No menu → “Menu not found.”
     - Active & online → return link to `/menus/{handle}/{locationId}`.
     - Active & offline → return “This menu is offline right now” message.
     - Multiple matches → pick most recent by `updatedAt`, log a data error.

---

## Admin Workflow

### 1. Publishing a New Menu
- Admin creates a `Menu` record with `isActive = false`.
- When ready to publish:
  - Set `isActive = true`.
  - Ensure any other menus for the same `locationId` are set to `isActive = false`.
- Result: only the new menu is discoverable for that location.

### 2. Unpublishing a Menu
- To retire a menu permanently:
  - Set `isActive = false`.
- Result: SMS lookups and web links will no longer return this menu.

### 3. Taking a Menu Offline (Temporary)
- Flip `isOffline = true` on an active menu.
- Customers texting the `locationId` will get a friendly “temporarily offline” message.
- When service resumes, set `isOffline = false` to reactivate the same menu.

### 4. Data Integrity Checks
- System should prevent two menus with the same `locationId` and `isActive = true`.
- If such a condition arises (e.g., due to a bug):
  - Keep the most recent by `updatedAt` as the winner.
  - Log an error for cleanup.

---

## Why This Contract Matters
- Keeps SMS + web responses predictable and user-friendly.
- Prevents duplicate/ambiguous menus for a single `locationId`.
- Separates **publishing** (long-lived) from **availability** (short-term state).
