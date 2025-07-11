# 🏭 Factory Dashboard

A modern, interactive factory monitoring dashboard built with React, TypeScript, and GSAP animations. Monitor production lines, equipment status, and manufacturing processes in real-time.

![Factory Dashboard](https://img.shields.io/badge/React-18.x-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![GSAP](https://img.shields.io/badge/GSAP-3.x-green?logo=greensock)
![Vite](https://img.shields.io/badge/Vite-7.x-purple?logo=vite)

## ✨ Features

- **🏭 Multi-Line Dashboard**: Monitor 5 production lines simultaneously
- **🎯 Interactive Equipment View**: Click any line to see detailed equipment status
- **⚡ Real-Time Animations**: GSAP-powered equipment simulations
- **📱 Responsive Design**: Works on desktop, tablet, and mobile
- **🎨 Modern UI**: Clean, minimalist interface with gradient backgrounds
- **🔧 Equipment Components**:
  - **Industrial Oven**: Temperature monitoring with flame effects
  - **Conveyor Belt**: Moving belt with item transport animation
  - **Hydraulic Press**: Compression cycles with pressure gauge
  - **Assembly Table**: Robot arm with welding spark effects

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/handrades/factory-dashboard-test-01.git
cd factory-dashboard-test-01

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the dashboard.

## 🏗️ Project Structure

```
src/
├── components/
│   ├── Equipment/           # Animated equipment components
│   │   ├── IndustrialOven.tsx
│   │   ├── ConveyorBelt.tsx
│   │   ├── Press.tsx
│   │   └── AssemblyTable.tsx
│   └── Dashboard/           # Main dashboard components
├── pages/
│   ├── Dashboard.tsx        # Main dashboard view
│   └── LineDetail.tsx       # Individual line details
├── context/
│   └── FactoryContext.tsx   # State management
└── utils/                   # Utility functions
```

## 🎮 Usage

1. **Main Dashboard**: View all 5 production lines with status indicators
2. **Line Details**: Click any line to see equipment flow and animations
3. **Equipment Monitoring**: Watch real-time simulations of industrial processes
4. **Navigation**: Use the back button to return to the main dashboard

## 🛠️ Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint

# Type checking
npm run type-check   # Run TypeScript compiler
```

## 🎨 Equipment Animations

Each equipment component features unique GSAP animations:

- **Oven**: Flame flickering, heat waves, temperature fluctuations
- **Conveyor**: Belt movement, item transport, roller rotation
- **Press**: Piston compression, pressure gauge, particle effects
- **Assembly**: Robot arm movement, part assembly, welding sparks

## 🔧 Technology Stack

- **Frontend**: React 18, TypeScript
- **Animations**: GSAP (GreenSock Animation Platform)
- **Routing**: React Router DOM
- **Build Tool**: Vite
- **Styling**: CSS Modules with CSS3 animations
- **State Management**: React Context API

## 📱 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Héctor Andrade** - [GitHub](https://github.com/handrades)

---

*Built with ❤️ using React, TypeScript, and GSAP*
