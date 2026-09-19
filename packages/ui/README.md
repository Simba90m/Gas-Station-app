# packages/ui

Reserved for cross-platform UI primitives shared between `apps/admin`
(React DOM) and `apps/mobile` (React Native).

Still empty as of Phase 3. Phase 3 built the admin dashboard's first real
components (Button, Input, Card, ...), but React DOM and React Native don't
share JSX, so a React-DOM-only component library isn't genuinely
"shared" yet — those live in `apps/admin/src/components/ui/` instead. This
package becomes useful once Phase 4/5 build mobile screens and there's
something concrete to compare against: either cross-platform *logic* (not
JSX), or React Native Web-compatible components, if that route is chosen
then. See `docs/ARCHITECTURE.md`.
