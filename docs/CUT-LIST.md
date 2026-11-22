# Screens you could cut

The OS has 14 screens. Cutting a few makes it faster to use and cheaper to keep correct, because every screen is code to maintain and test. Below is what I would cut, from strongest case to weakest. Nothing has been removed: tell me which ones to cut.

| # | Cut | Why | What you lose | Keep it if |
|---|---|---|---|---|
| 1 | **Demo mode** (the sample-data version of every screen, about 1,000 lines) | Live mode works for every screen now. Each change to a screen currently has to keep two versions in sync. | The no-login preview with sample data. | You want to show the OS to clients or a team member without giving them your login. |
| 2 | **Pipeline board** | HighLevel owns the pipeline, and the build brief says not to duplicate the CRM. Home, Jarvis and MCP already show the pipeline numbers. | Moving deals and adding contacts from inside the OS. You'd do it in HighLevel. | You move deals from the OS more than from HighLevel. |
| 3 | **AI Chat**, merged into **AI Team** | Two places to talk to the AI. AI Chat is effectively a general agent; it could be the first row in AI Team, with the Strategy Room as a toggle there. | A separate nav item. Nothing functional. | You like a blank chat that isn't tied to an agent. |
| 4 | **Vault**, merged into **Content** as a "Swipe" tab | It's the smallest screen, and it overlaps with Content research and Brain sources. Its briefs already turn into Content cards. | A separate nav item. Nothing functional. | You save a lot of swipe files that aren't content (for example landing pages or emails). |
| 5 | **Programs**, hidden until you build a course | HighLevel owns courses. This screen only matters while you design one. | The program board and the "send as draft course" action, until you turn it back on. | You plan to launch a course or program in the next few months. |

## What I would keep

| Screen | Why it stays |
|---|---|
| Jarvis (Home) | The daily starting point: live numbers and spoken answers. |
| Approvals | The single queue. Everything AI-made passes through it. |
| AI Team | Agents and routines. |
| Brain | The source of truth for every prompt. |
| Content | Your main production work. |
| Emails, Funnels | You sell with webinars and funnels; these send to HighLevel. |
| Graphics | Cut it only if you design everything in Canva. |
| Goals | Small screen, and the only place targets are tracked against live numbers. |
| Connections and Settings | Required. |

If you cut 1 to 5, the sidebar goes from 14 items to 10, and roughly 1,400 lines of front-end code go away.
