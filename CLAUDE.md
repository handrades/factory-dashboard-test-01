# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server (runs on http://localhost:5173)
- `npm run build` - Build for production (TypeScript compilation + Vite build)
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint to check code quality

### Type Checking
- `tsc -b` - Run TypeScript compiler (part of build process)
- Note: No separate type-check script exists; use `npm run build` to verify types

## Architecture Overview

This is a React TypeScript factory monitoring dashboard using GSAP for animations and React Router for navigation.

### Core Structure
- **State Management**: React Context API via `FactoryContext.tsx` - manages 6 production lines with equipment data, real-time updates every 2 seconds
- **Routing**: React Router DOM with two main routes: Dashboard (/) and LineDetail (/:lineId)
- **Animation Engine**: GSAP for all equipment animations (flames, conveyor movement, press cycles, etc.)

### Key Components
- **Equipment Components** (`src/components/Equipment/`): Each equipment type has its own animated component
  - `IndustrialOven.tsx` - Flame effects, heat waves, temperature monitoring
  - `ConveyorBelt.tsx` - Moving belt animation with item transport
  - `Press.tsx` - Hydraulic compression cycles with pressure gauge
  - `AssemblyTable.tsx` - Robot arm movement with welding sparks
  - `IndustrialOvenConveyor.tsx` - Combined oven + conveyor component

### Equipment Data Model
Equipment objects have:
- `type`: 'oven' | 'conveyor' | 'press' | 'assembly' | 'oven-conveyor'
- `status`: 'running' | 'stopped' | 'error'
- Dynamic properties: `temperature`, `speed`, `pressure` (depending on type)

### Animation Patterns
- All equipment animations use GSAP timelines with `repeat: -1`
- Animations are conditional based on `isActive` prop (derived from equipment status)
- Each component uses useRef hooks for DOM element targeting
- Animations include glow effects, particle systems, and realistic mechanical movements

### Deployment
- Configured for GitHub Pages with base path `/factory-dashboard-test-01/`
- Build output goes to `dist/` directory
- Uses Vite as build tool with React plugin

### Styling
- CSS modules pattern with component-specific `.css` files
- Gradient backgrounds and modern UI design
- Responsive design for desktop, tablet, and mobile

## Project Maintenance

### File Structure Updates
- Everytime new files or directories are added to this project. Always update the readme file structure. This way we can always keep it up to date.