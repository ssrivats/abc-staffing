# Plain App Design Language

> Extracted from Plain (plain.com) — a modern customer support platform.
> Reference screens on Mobbin: [Thread Detail](https://mobbin.com/screens/1966e1c8-fa8b-45e1-a6de-d3cdd2253322) | [Inbox View](https://mobbin.com/screens/6b03543c-d8bd-403c-a3eb-3c43783a0a23) | [Support Flow](https://mobbin.com/flows/545716f1-f46d-4026-8633-3cbe983fbea6) | [Chat Flow](https://mobbin.com/flows/e6ef55b4-7a85-4a32-bd77-54c94d178d5d) | [Reply Flow](https://mobbin.com/flows/5ad6ddb0-b7d7-4a67-82c0-1412d3ffc719) | [Workflow Builder](https://mobbin.com/flows/be77e9ad-da94-4c4a-8d52-f0fe5be140b0)

---

## 1. Color Palette

### Brand Colors
| Token               | Value       | Usage                                    |
|----------------------|-------------|------------------------------------------|
| `--green-500`        | `#37B24D`   | Primary brand, active nav, "Done" status |
| `--green-100`        | `#E6F9ED`   | Active sidebar item background           |
| `--blue-500`         | `#4C6EF5`   | Links, "Todo" badge, info states         |
| `--blue-100`         | `#E7EDFF`   | Highlighted selected thread background   |

### Neutrals
| Token               | Value       | Usage                                    |
|----------------------|-------------|------------------------------------------|
| `--gray-900`         | `#1A1A1A`   | Primary text, headings                   |
| `--gray-700`         | `#4A4A4A`   | Secondary text, metadata labels          |
| `--gray-500`         | `#8C8C8C`   | Tertiary text, timestamps, placeholders  |
| `--gray-300`         | `#D1D1D1`   | Borders, dividers                        |
| `--gray-100`         | `#F5F5F5`   | Subtle backgrounds, hover states         |
| `--gray-50`          | `#FAFAFA`   | Panel backgrounds, sidebar bg            |
| `--white`            | `#FFFFFF`   | Content area background                  |

### Status / Semantic Colors
| Token               | Value       | Usage                                    |
|----------------------|-------------|------------------------------------------|
| `--status-green`     | `#37B24D`   | Done, resolved, active                   |
| `--status-yellow`    | `#F59F00`   | Waiting for customer, snoozed, warnings  |
| `--status-amber`     | `#FFF3D0`   | AI summary card background, note bg      |
| `--status-red`       | `#E03131`   | Urgent priority, error states            |
| `--status-blue`      | `#4C6EF5`   | Needs first response, informational      |
| `--status-purple`    | `#7C3AED`   | AI/Sidekick accent                       |

### Priority Colors
| Priority  | Dot Color   | Label Color  |
|-----------|-------------|--------------|
| Urgent    | `#E03131`   | `#E03131`    |
| High      | `#F59F00`   | `#F59F00`    |
| Normal    | `#868E96`   | `#868E96`    |
| Low       | `#CED4DA`   | `#868E96`    |

---

## 2. Typography

**Font Family:** `Inter` (sans-serif), fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

| Style                | Size     | Weight       | Line Height | Usage                              |
|----------------------|----------|--------------|-------------|------------------------------------|
| Page heading         | `18px`   | `600` (Semi) | `1.3`       | Page titles ("All threads", "Todo")|
| Thread title         | `14px`   | `600` (Semi) | `1.4`       | Thread subject in list & detail    |
| Body                 | `14px`   | `400` (Reg)  | `1.5`       | Message body, descriptions         |
| Body small           | `13px`   | `400` (Reg)  | `1.5`       | Thread preview, metadata values    |
| Label                | `12px`   | `500` (Med)  | `1.3`       | Sidebar items, detail panel labels |
| Caption              | `11px`   | `400` (Reg)  | `1.3`       | Timestamps, thread IDs (T-5, T-6) |
| Nav item             | `13px`   | `500` (Med)  | `1.4`       | Sidebar navigation links           |
| Badge count          | `11px`   | `600` (Semi) | `1.0`       | Numeric badges in sidebar          |
| Keyboard shortcut    | `11px`   | `500` (Med)  | `1.0`       | Action bar shortcut hints (R, N)   |

---

## 3. Layout Architecture

### Three-Panel Layout (Primary)
```
+-------------------+---------------------------+---------------------+
| Left Sidebar      | Center Content            | Right Detail Panel  |
| ~200px            | flex: 1 (fluid)           | ~300px              |
| Navigation +      | Thread list OR            | Thread metadata,    |
| Thread views      | Conversation detail       | customer info,      |
|                   |                           | actions, similar    |
+-------------------+---------------------------+---------------------+
```

### Left Sidebar (~200px)
- Workspace selector at top (logo + name + product area)
- Icon rail on far left (~48px) for primary navigation
- Expandable text sidebar for thread views
- Collapsible sections: Threads, Favorites, Browse
- Bottom: Help, keyboard shortcuts, support links

### Center Content (fluid)
- When showing thread list: header with view name + Filters/Display controls
- When showing thread detail: thread header + conversation timeline + action bar
- Thread list rows: avatar + name + thread ID + subject + preview + time + priority

### Right Detail Panel (~300px)
- Thread title repeated at top
- Key-value metadata grid (Status, Assignee, Priority, Labels, Thread tier)
- Collapsible sections: Links, Tasks, Theme, Actions, Similar threads
- Customer card at bottom: name, email, groups

---

## 4. Spacing System

| Token       | Value   | Usage                                     |
|-------------|---------|-------------------------------------------|
| `--sp-1`    | `4px`   | Inline icon gaps, tight padding            |
| `--sp-2`    | `8px`   | Compact element spacing, badge padding     |
| `--sp-3`    | `12px`  | List item padding (vertical)               |
| `--sp-4`    | `16px`  | Section gaps, standard padding             |
| `--sp-5`    | `20px`  | Panel internal padding                     |
| `--sp-6`    | `24px`  | Section separators, larger gaps            |
| `--sp-8`    | `32px`  | Page-level spacing                         |

---

## 5. Component Library

### 5.1 Thread List Item
```
+-[ Avatar ]--[ Name ]--[ Thread ID ]--[ Subject ]--[ Preview... ]--[ Time ]--[ Priority ]-+
|   32px       bold       gray/small    semibold     gray truncated   gray      dot+label   |
+------------------------------------------------------------------------------------------+
```
- Row height: ~56px
- Active/selected: light blue background (`--blue-100`)
- Hover: `--gray-100` background
- Avatar: 32px circle with initial letter, colored background
- Thread ID prefix: "T-" followed by number, in gray caption style
- Priority: small colored dot + text label

### 5.2 Conversation Timeline (Thread Detail)
- Messages: full-width cards with sender name, timestamp, and body
- Email display: shows To/From/CC fields, subject line
- Internal notes: amber/yellow background with "Not visible to [name]" warning
- Status changes: centered gray text with icon ("You changed status to Done")
- AI Summary: amber card with "Summary" label, collapsible "Show conversation details"
- Waiting indicator: green highlight bar — "[name] is waiting for a first response"

### 5.3 Action Bar (Bottom of Thread Detail)
```
+--[ Reply R ]--[ Note N ]--[ ··· More ]--[ Sidekick $ ]--+
```
- Fixed to bottom of center panel
- Icon + label + keyboard shortcut letter
- Muted text by default, darkens on hover
- "Reply & wait" variant: green primary button style

### 5.4 Detail Panel (Right)
```
Status        ● Needs first response
Assignee         Unassigned
Priority      ═ Normal
Labels           Labels  +
Thread tier      Tier
```
- Label on left (~40%): `--gray-500`, 12px, medium weight
- Value on right (~60%): `--gray-900`, 13px, regular weight
- "+" button for adding items (Labels, Links, etc.)
- Collapsible sections with chevron icon

### 5.5 Navigation Sidebar
- **Section headers**: ALL CAPS, 11px, `--gray-500`, letter-spacing 0.5px
- **Nav items**: 13px medium, with icon (20px) + text + optional count badge
- **Active item**: green text + light green background (`--green-100`)
- **Badge**: rounded pill, green bg + white text for counts
- **Nested sub-items**: indented 12px, with status icon prefix

### 5.6 Status Badges / Chips
| Status                  | Style                                          |
|-------------------------|-------------------------------------------------|
| Needs first response    | Blue dot + blue text                            |
| Waiting for customer    | Yellow dot + text                               |
| Done                    | Green dot + green text                          |
| Snoozed                 | Gray clock icon + text                          |
| Priority (Normal)       | Gray bar icon + gray text                       |
| Priority (High)         | Yellow/orange bar + text                        |
| Priority (Urgent)       | Red bar + red text                              |

### 5.7 Chat Widget (Customer-Facing)
- Floating bottom-right panel, ~360px wide
- Header with back arrow + thread title + expand/close icons
- Message bubbles: left-aligned agent (white bg, border), right-aligned customer (green bg)
- Input area: "Start typing" placeholder with Bold/Italic/Code formatting toolbar
- "Send" button: green primary, right-aligned
- "Powered by Plain" footer

### 5.8 Workflow Builder
- Canvas-based visual editor with connected node cards
- Node cards: white bg, rounded corners, 8px border-radius, light shadow
- Connection lines: smooth bezier curves between nodes
- Node types: Start, Filter, Apply labels, Assign to user, Send message
- Right panel: configuration for selected node
- Header: breadcrumb + Published/Draft status + Save button

---

## 6. Border & Shadow

| Token                  | Value                                     | Usage                     |
|------------------------|-------------------------------------------|---------------------------|
| `--border-default`     | `1px solid #E5E5E5`                       | Panel borders, dividers   |
| `--border-subtle`      | `1px solid #F0F0F0`                       | Internal separators       |
| `--border-radius-sm`   | `4px`                                     | Badges, chips, inputs     |
| `--border-radius-md`   | `6px`                                     | Cards, buttons            |
| `--border-radius-lg`   | `8px`                                     | Panels, dialogs, widgets  |
| `--border-radius-full` | `9999px`                                  | Avatars, pill badges      |
| `--shadow-sm`          | `0 1px 2px rgba(0,0,0,0.05)`             | Subtle elevation          |
| `--shadow-md`          | `0 2px 8px rgba(0,0,0,0.08)`             | Floating panels, widgets  |
| `--shadow-lg`          | `0 4px 16px rgba(0,0,0,0.12)`            | Modals, dropdowns         |

---

## 7. Iconography

- **Style**: Outlined/stroke-based, 20px default size, 1.5px stroke
- **Source**: Custom icon set (similar to Lucide / Heroicons outline style)
- **Key icons used**:
  - Home, Search, Threads, Settings, Help (sidebar primary nav)
  - Arrow left (back navigation)
  - Filter, Display/columns, Sort (list controls)
  - Reply, Note (pencil), More (three dots), Sidekick (sparkle) (action bar)
  - Clock (snoozed), Check circle (done), Plus (add)
  - Link, Task, Theme, Workflow (detail panel sections)
  - Keyboard shortcuts shown inline as bordered letter keys

---

## 8. Motion & Interaction

| Interaction              | Behavior                                         |
|--------------------------|--------------------------------------------------|
| Sidebar collapse/expand  | Smooth slide, ~200ms ease-in-out                 |
| Panel transitions        | Crossfade, ~150ms                                |
| Hover on list items      | Background color transition, ~100ms              |
| Status change            | Inline animation with checkmark                  |
| Chat widget open/close   | Slide up from bottom-right corner, ~250ms        |
| Dropdown menus           | Fade in + slight downward slide, ~120ms          |
| Keyboard shortcuts       | Instant action, no delay                         |

---

## 9. Key UX Patterns

### Thread Lifecycle States
```
Needs first response → Needs next response → Investigating → Close the loop → Done
                                                         ↘ Waiting for customer ↗
                                                         ↘ Paused for later ↗
```

### Keyboard-First Design
- `R` — Reply
- `N` — Add Note
- `C` — Ask Cursor / AI
- `D` — Discuss in thread
- `$` / `B` — Sidekick (AI assistant)
- `T` — Tasks
- Thread navigation with arrow keys

### AI Integration Points
- **Summary cards**: Auto-generated conversation summaries in amber cards
- **Sidekick**: AI assistant accessible from action bar
- **Ask Cursor**: AI-powered query in detail panel actions
- **Ari AI Agent**: Configurable AI agent with knowledge sources, assignment workflows, and tone rules

### Internal Notes Pattern
- Yellow/amber background distinguishing from customer-visible messages
- "Not visible to [customer name]" warning with red indicator
- Separate "Note" action in action bar distinct from "Reply"

---

## 10. Dark Mode (Observed in Lemni/Alternative Views)

Plain also supports a dark theme variant:

| Token               | Light          | Dark            |
|----------------------|----------------|-----------------|
| Background           | `#FFFFFF`      | `#1A1A2E`       |
| Surface              | `#FAFAFA`      | `#232340`       |
| Text primary         | `#1A1A1A`      | `#E8E8E8`       |
| Text secondary       | `#8C8C8C`      | `#9898A8`       |
| Border               | `#E5E5E5`      | `#2E2E4A`       |
| Active nav bg        | `#E6F9ED`      | `#1A3D2A`       |

---

## 11. Responsive Considerations

- **Desktop (1200px+)**: Full three-panel layout
- **Tablet (768-1199px)**: Two panels — sidebar collapses to icon rail, detail panel overlays
- **Mobile/Widget**: Single panel — chat widget style, stacked navigation

---

## 12. File Attachment Patterns

- Attached files shown as thumbnail cards within messages
- PDF attachments: show file icon + name + size
- Image attachments: inline thumbnail preview
- Email-style attachments: listed below message body with download affordance

---

## Quick-Start CSS Variables

```css
:root {
  /* Brand */
  --plain-green: #37B24D;
  --plain-green-light: #E6F9ED;
  --plain-blue: #4C6EF5;
  --plain-blue-light: #E7EDFF;
  --plain-purple: #7C3AED;

  /* Neutrals */
  --plain-gray-900: #1A1A1A;
  --plain-gray-700: #4A4A4A;
  --plain-gray-500: #8C8C8C;
  --plain-gray-300: #D1D1D1;
  --plain-gray-100: #F5F5F5;
  --plain-gray-50: #FAFAFA;
  --plain-white: #FFFFFF;

  /* Status */
  --plain-status-done: #37B24D;
  --plain-status-waiting: #F59F00;
  --plain-status-warning-bg: #FFF3D0;
  --plain-status-urgent: #E03131;
  --plain-status-info: #4C6EF5;

  /* Typography */
  --plain-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --plain-text-xs: 11px;
  --plain-text-sm: 12px;
  --plain-text-base: 13px;
  --plain-text-md: 14px;
  --plain-text-lg: 18px;

  /* Spacing */
  --plain-sp-1: 4px;
  --plain-sp-2: 8px;
  --plain-sp-3: 12px;
  --plain-sp-4: 16px;
  --plain-sp-5: 20px;
  --plain-sp-6: 24px;
  --plain-sp-8: 32px;

  /* Borders & Radius */
  --plain-border: 1px solid #E5E5E5;
  --plain-radius-sm: 4px;
  --plain-radius-md: 6px;
  --plain-radius-lg: 8px;
  --plain-radius-full: 9999px;

  /* Shadows */
  --plain-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --plain-shadow-md: 0 2px 8px rgba(0,0,0,0.08);
  --plain-shadow-lg: 0 4px 16px rgba(0,0,0,0.12);
}
```
