import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, RefreshCw, Skull, Volume2, VolumeX, Settings, Zap } from 'lucide-react';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };

const TRACKS = [
  { id: 1, title: 'SYNTH_GRID.WAV', artist: 'NULL_ENTITY', cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=80', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 2, title: 'NEON_OVERDRIVE.MP3', artist: 'UNKNOWN_HOST', cover: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=200&q=80', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 3, title: 'DECAY.FLAC', artist: 'CORRUPTED_SECTOR', cover: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=200&q=80', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export default function App() {
  // --- Audio State ---
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Game Config & Settings ---
  const [speedUI, setSpeedUI] = useState(5); 
  const [autoSpeedUp, setAutoSpeedUp] = useState(true);
  const speedRef = useRef(5);

  const getTickDelay = (speed: number) => Math.max(40, 250 - ((speed - 1) * 22));
  const tickDelayRef = useRef(getTickDelay(5));

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setSpeedUI(val);
    speedRef.current = val;
    tickDelayRef.current = getTickDelay(val);
  };

  // --- Core Game Engine Refs ---
  const snakeRef = useRef([...INITIAL_SNAKE]);
  const directionRef = useRef({ ...INITIAL_DIRECTION });
  const pendingDirectionRef = useRef({ ...INITIAL_DIRECTION });
  const foodRef = useRef({ x: 5, y: 5 });
  const scoreRef = useRef(0);
  
  const gameStartedRef = useRef(false);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);

  // --- UI Reactive State (Sync'd to engine for renders) ---
  const [snakeState, setSnakeState] = useState([...INITIAL_SNAKE]);
  const [foodState, setFoodState] = useState(foodRef.current);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('neon_snake_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Juice & FX State
  const [isShaking, setIsShaking] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<any[]>([]);

  // Mobile Detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Swipe Detection
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const dx = touchEnd.x - touchStartRef.current.x;
    const dy = touchEnd.y - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return; // Ignore small taps

    const currentSimulated = pendingDirectionRef.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && currentSimulated.x !== -1) pendingDirectionRef.current = { x: 1, y: 0 };
      else if (dx < 0 && currentSimulated.x !== 1) pendingDirectionRef.current = { x: -1, y: 0 };
    } else {
      if (dy > 0 && currentSimulated.y !== -1) pendingDirectionRef.current = { x: 0, y: 1 };
      else if (dy < 0 && currentSimulated.y !== 1) pendingDirectionRef.current = { x: 0, y: -1 };
    }
  };

  const manualMove = (dir: { x: number, y: number }) => {
    const currentSimulated = pendingDirectionRef.current;
    if (dir.x !== 0 && currentSimulated.x !== -dir.x) pendingDirectionRef.current = dir;
    if (dir.y !== 0 && currentSimulated.y !== -dir.y) pendingDirectionRef.current = dir;
    if (!gameStartedRef.current && !gameOverRef.current) {
        gameStartedRef.current = true;
        setGameStarted(true);
        if (!isPlaying) setIsPlaying(true);
    }
  };
  
  // Visualizer Ref
  const visualizerRef = useRef(Array(12).fill(10));
  const [visualizerState, setVisualizerState] = useState(visualizerRef.current);

  // --- Audio Execution Hooks ---
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = isMuted;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIdx, isMuted]);

  useEffect(() => localStorage.setItem('neon_snake_highscore', highScore.toString()), [highScore]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const nextTrack = useCallback(() => { setCurrentTrackIdx((prev) => (prev + 1) % TRACKS.length); setIsPlaying(true); }, []);
  const prevTrack = useCallback(() => { setCurrentTrackIdx((prev) => (prev - 1 + TRACKS.length) % TRACKS.length); setIsPlaying(true); }, []);
  const toggleMute = () => setIsMuted(p => !p);

  // --- Juice Triggers ---
  const triggerDeathShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const triggerScoreFlash = () => {
    setIsScoring(true);
    setTimeout(() => setIsScoring(false), 250);
  };

  const spawnParticles = (gx: number, gy: number) => {
    const cs = canvasRef.current;
    if (!cs) return;
    const w = cs.width;
    const h = cs.height;
    const px = (gx / GRID_SIZE) * w + (w / GRID_SIZE) / 2;
    const py = (gy / GRID_SIZE) * h + (h / GRID_SIZE) / 2;
    
    const count = isMobile ? 12 : 25; // Reduce particles on mobile for performance
    for(let i = 0; i < count; i++) {
        particlesRef.current.push({
            x: px, y: py,
            vx: (Math.random() - 0.5) * (w * (isMobile ? 0.015 : 0.012)),
            vy: (Math.random() - 0.5) * (h * (isMobile ? 0.015 : 0.012)),
            life: 1.0,
            decay: isMobile ? 0.04 : 0.02 + Math.random() * 0.03,
            color: Math.random() > 0.5 ? '#ec4899' : '#00ffff'
        });
    }
  };

  // --- Main Engine Loop (requestAnimationFrame for precise timing + particles) ---
  const rAFRef = useRef<number>();
  const lastTickTimeRef = useRef(performance.now());
  const lastVisTimeRef = useRef(performance.now());
  
  const tickLogic = useCallback(() => {
    if (!gameStartedRef.current || gameOverRef.current || pausedRef.current) return;

    directionRef.current = pendingDirectionRef.current;
    
    const currentSnake = snakeRef.current;
    const head = currentSnake[0];
    const newHead = { x: head.x + directionRef.current.x, y: head.y + directionRef.current.y };

    // 1. OOB detection
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      handleGameOver(); return;
    }

    // 2. Self Collision
    if (currentSnake.some(s => s.x === newHead.x && s.y === newHead.y)) {
      handleGameOver(); return;
    }

    const newSnake = [newHead, ...currentSnake];

    // 3. Food Logic
    if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
      scoreRef.current += 10;
      setScore(scoreRef.current);
      triggerScoreFlash();
      spawnParticles(foodRef.current.x, foodRef.current.y);

      const snacksCount = scoreRef.current / 10;
      if (autoSpeedUp && snacksCount % 5 === 0 && speedRef.current < 10) {
          const newSpeed = speedRef.current + 1;
          speedRef.current = newSpeed;
          setSpeedUI(newSpeed);
          tickDelayRef.current = getTickDelay(newSpeed);
      }

      let newFood;
      while (true) {
        newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
        const isOccupied = newSnake.some(s => s.x === newFood.x && s.y === newFood.y);
        if (!isOccupied) break;
      }
      foodRef.current = newFood;
      setFoodState(newFood);
    } else {
      newSnake.pop(); 
    }

    snakeRef.current = newSnake;
    setSnakeState([...newSnake]);
  }, [autoSpeedUp]);

  const loop = useCallback((time: number) => {
    rAFRef.current = requestAnimationFrame(loop);

    if (canvasRef.current && particlesRef.current.length > 0) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
         ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
         particlesRef.current = particlesRef.current.filter(p => {
             p.x += p.vx; p.y += p.vy;
             p.life -= p.decay;
             ctx.fillStyle = p.color;
             ctx.globalAlpha = Math.max(0, p.life);
             const size = (canvasRef.current!.width / GRID_SIZE) * 0.4;
             ctx.fillRect(p.x - size/2, p.y - size/2, size, size);
             return p.life > 0;
         });
         ctx.globalAlpha = 1.0;
      }
    }

    if (isPlaying && (time - lastVisTimeRef.current > 100)) {
       const nextVis = visualizerRef.current.map(v => {
           return Math.random() > 0.8 ? Math.random() * 80 + 20 : Math.max(5, v - (v * 0.15));
       });
       visualizerRef.current = nextVis;
       setVisualizerState(nextVis);
       lastVisTimeRef.current = time;
    }

    if (time - lastTickTimeRef.current >= tickDelayRef.current) {
        tickLogic();
        lastTickTimeRef.current = time;
    }
  }, [isPlaying, tickLogic]);

  useEffect(() => {
    rAFRef.current = requestAnimationFrame(loop);
    return () => { if (rAFRef.current) cancelAnimationFrame(rAFRef.current); };
  }, [loop]);

  // --- Input & Control handlers ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();

      const key = e.key.toLowerCase();

      if (key === ' ') {
        if (!gameStartedRef.current) { 
          gameStartedRef.current = true; setGameStarted(true); 
          if (!isPlaying) setIsPlaying(true); 
        } 
        else if (gameOverRef.current) resetGame();
      }

      const currentSimulated = pendingDirectionRef.current;
      
      switch (key) {
        case 'arrowup': case 'w': 
           if (currentSimulated.y !== 1) pendingDirectionRef.current = { x: 0, y: -1 }; break;
        case 'arrowdown': case 's': 
           if (currentSimulated.y !== -1) pendingDirectionRef.current = { x: 0, y: 1 }; break;
        case 'arrowleft': case 'a': 
           if (currentSimulated.x !== 1) pendingDirectionRef.current = { x: -1, y: 0 }; break;
        case 'arrowright': case 'd': 
           if (currentSimulated.x !== -1) pendingDirectionRef.current = { x: 1, y: 0 }; break;
      }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  const handleGameOver = () => {
    gameOverRef.current = true;
    setGameOver(true);
    triggerDeathShake();
    setHighScore(prev => Math.max(prev, scoreRef.current));
  };

  const resetGame = () => {
    snakeRef.current = [...INITIAL_SNAKE]; 
    directionRef.current = { ...INITIAL_DIRECTION };
    pendingDirectionRef.current = { ...INITIAL_DIRECTION };
    scoreRef.current = 0; 
    gameOverRef.current = false;
    
    if (autoSpeedUp) {
       speedRef.current = 5;
       setSpeedUI(5);
       tickDelayRef.current = getTickDelay(5);
    }
    
    setSnakeState([...INITIAL_SNAKE]); 
    setScore(0); 
    setGameOver(false); 
    gameStartedRef.current = true;
    setGameStarted(true);

    let newFood;
    while (true) {
      newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
      const isOccupied = INITIAL_SNAKE.some(s => s.x === newFood.x && s.y === newFood.y);
      if (!isOccupied) break;
    }
    foodRef.current = newFood;
    setFoodState(newFood);
    
    particlesRef.current = [];
    if(canvasRef.current) canvasRef.current.getContext('2d')?.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
  };

  const currentTrack = TRACKS[currentTrackIdx];

  return (
    <div className={`min-h-screen font-sans bg-[#050505] text-[#fff] relative overflow-x-hidden ${isShaking ? 'shake-viewport' : ''}`}>
      <div className="noise-bg"></div>
      <div className="scanlines"></div>

      <div className="relative z-10 p-4 lg:p-8 h-full min-h-screen flex flex-col md:max-w-7xl mx-auto">
        
        {/* Sleek Header */}
        <header className="flex justify-between items-center mb-8 shrink-0 border-b border-white/10 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.6)]">
              <Zap className="text-black" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter italic m-0">NEON<span className="text-cyan-400">SYNC</span></h1>
          </div>
              <div className="hidden sm:flex px-4 py-1.5 rounded-full border border-pink-500/50 bg-pink-500/10 text-pink-400 text-xs font-bold tracking-widest items-center gap-2 shadow-[0_0_10px_rgba(236,72,153,0.3)]">
             <div className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
             SYSTEM ONLINE
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6 w-full">
           
           {/* Section 1: Settings & Options (Left Column) */}
           <section className="md:col-span-12 lg:col-span-3 flex flex-col gap-4 order-2 lg:order-1">
              
               <div className="h-full bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex flex-col gap-6 shadow-xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none group-hover:from-cyan-500/10 transition-colors" />
                  <div className="relative z-10 flex items-center gap-2 text-white/50 border-b border-white/5 pb-2">
                     <Settings size={18} className="text-cyan-400" />
                     <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-50/70">Global Settings</h3>
                  </div>

                  <div className="relative z-10 space-y-4">
                     <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-1 text-cyan-400">
                        <span>Speed Level</span>
                        <span>{speedUI < 4 ? 'Chill' : speedUI > 8 ? 'Insane' : 'Optimal'} ({speedUI})</span>
                     </div>
                     <input 
                        type="range" min="1" max="10" step="1" 
                        value={speedUI} onChange={handleSpeedChange}
                        className="cyber-slider"
                     />
                  </div>

                  <div className="relative z-10 flex items-center justify-between pt-2">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Engine Autoscale</span>
                     <button 
                        onClick={() => setAutoSpeedUp(!autoSpeedUp)}
                        className={`w-10 h-5 rounded-full p-1 transition-colors ${autoSpeedUp ? 'bg-cyan-500' : 'bg-white/20'}`}
                     >
                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transition-transform ${autoSpeedUp ? 'translate-x-5' : 'translate-x-0'}`} />
                     </button>
                  </div>
               </div>

               {/* Hint Box - now visible on MD up */}
               <div className="hidden md:flex bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex-col gap-3 shadow-xl h-full justify-center">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 border-l-2 border-cyan-500 pl-3">Input Protocols</h3>
                 <div className="text-[10px] text-white/50 space-y-3 font-bold uppercase tracking-wider pl-3">
                   <p className="flex justify-between items-center gap-4"><span>Motion</span> <span className="text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">WASD / ARROW</span></p>
                   <p className="flex justify-between items-center gap-4"><span>Execute</span> <span className="text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">SPACE / TAP</span></p>
                 </div>
               </div>

           </section>

           {/* Section 2: Game Board Center */}
           <section className="md:col-span-12 lg:col-span-6 flex flex-col items-center order-1 lg:order-2">
             
             {/* Stats Header */}
             <div className="w-full max-w-[600px] flex justify-between items-end mb-4 px-1">
                <div className="flex flex-col">
                   <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-400 opacity-60">SCORE.READOUT</span>
                   </div>
                   <span className="text-4xl sm:text-6xl font-black tabular-nums tracking-tighter leading-none text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                     {score.toString().padStart(4, '0')}
                   </span>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-pink-500/60 mb-1">RECORD.MAX</span>
                   <span className="text-2xl sm:text-3xl font-black tabular-nums tracking-tighter leading-none text-white/40">
                     {highScore.toString().padStart(4, '0')}
                   </span>
                </div>
             </div>

             {/* The Sleek Frame */}
             <div 
               className={`relative w-full max-w-[600px] aspect-square rounded-2xl bg-[#080808] border-2 overflow-hidden transition-all duration-75 touch-none
                 ${isScoring ? 'score-flash' : 'neon-pulse'}
                 flex items-center justify-center p-1 md:p-2 ${isMobile ? '' : 'shadow-2xl'}
               `}
               style={{ '--pulse-speed': `${tickDelayRef.current * 4}ms` } as React.CSSProperties}
               onTouchStart={handleTouchStart}
               onTouchEnd={handleTouchEnd}
             >
                <div className="relative w-full h-full bg-[#050505] rounded-xl overflow-hidden border border-white/5">
                    
                    {/* Background Grid Pattern */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:5%_5%]"></div>

                    {/* Canvas for extremely smooth particles */}
                    <canvas ref={canvasRef} width={1000} height={1000} className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-90 mix-blend-screen"></canvas>

                    {/* The entities - Smooth Continuous Position Rendering */}
                    {/* Food */}
                    <div 
                      className="absolute bg-pink-500 rounded-full shadow-[0_0_15px_#ec4899] z-10 mix-blend-screen animate-pulse"
                      style={{
                        left: `${(foodState.x / GRID_SIZE) * 100}%`,
                        top: `${(foodState.y / GRID_SIZE) * 100}%`,
                        width: `${100 / GRID_SIZE}%`,
                        height: `${100 / GRID_SIZE}%`,
                      }}
                    >
                      {/* Inner core */}
                      <div className="absolute inset-[2px] bg-white rounded-full opacity-80 mix-blend-overlay"></div>
                    </div>

                    {/* Snake Nodes */}
                    {snakeState.map((node, i) => {
                      const isHead = i === 0;
                      return (
                        <div 
                          key={i}
                          className={`absolute mix-blend-screen z-20 ${isHead ? 'bg-white' : 'bg-cyan-400'}`}
                          style={{
                            left: `${(node.x / GRID_SIZE) * 100}%`,
                            top: `${(node.y / GRID_SIZE) * 100}%`,
                            width: `${100 / GRID_SIZE}%`,
                            height: `${100 / GRID_SIZE}%`,
                            boxShadow: isHead ? '0 0 15px rgba(255,255,255,0.8)' : '0 0 10px rgba(6,182,212,0.6)',
                            borderRadius: isHead ? '4px' : '2px',
                            transition: `all ${tickDelayRef.current}ms linear`,
                            transform: 'scale(0.9)', 
                          }}
                        />
                      );
                    })}

                    {/* Menus / Overlays over gameplay */}
                    {!gameStarted && !gameOver && (
                        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.4)] animate-pulse mb-6">
                            <Play size={28} className="translate-x-0.5" />
                          </div>
                          <h2 className="text-2xl font-black text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)] uppercase tracking-widest mb-2">Initialize Run</h2>
                          <p className="text-white/50 text-sm font-medium uppercase tracking-widest">Press Space to Connect</p>
                        </div>
                    )}

                    {gameOver && (
                        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-[10px] flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-full max-w-[300px] bg-[#111]/80 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center">
                             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-purple-500"></div>
                             
                             <Skull size={48} className="text-pink-500 mb-4 drop-shadow-[0_0_15px_rgba(236,72,153,0.8)]" />
                             
                           <h2 className="text-xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] uppercase tracking-widest mb-2 border-b border-white/10 pb-4 w-full text-center">
                               GAME OVER: CRASH DETECTED
                             </h2>
                             
                             <div className="flex flex-col mb-6">
                               <span className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Final Analysis</span>
                               <span className="text-3xl font-black text-cyan-400">{score.toString().padStart(4, '0')}</span>
                             </div>
                             
                             <button 
                                onClick={resetGame}
                                className="w-full py-4 px-6 bg-cyan-500 text-black font-black uppercase tracking-widest rounded-xl hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all hover:scale-105 active:scale-95 group flex flex-col items-center justify-center gap-1"
                             >
                               <div className="flex items-center gap-2">
                                 <RefreshCw size={18} className="group-hover:animate-spin-slow" />
                                 REINITIALIZE
                               </div>
                               <span className="text-[8px] font-bold opacity-60">TAP / CLICK TO RESTART</span>
                             </button>
                          </div>
                        </div>
                    )}
                </div>
             </div>

             {/* Mobile D-Pad */}
             {isMobile && (
                <div className="grid grid-cols-3 gap-2 mt-6 w-full max-w-[240px]">
                    <div />
                    <button 
                        className="h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
                        onPointerDown={() => manualMove({x: 0, y: -1})}
                    >
                        <Zap size={20} className="-rotate-90" fill="currentColor" />
                    </button>
                    <div />
                    
                    <button 
                        className="h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
                        onPointerDown={() => manualMove({x: -1, y: 0})}
                    >
                        <Zap size={20} className="rotate-180" fill="currentColor" />
                    </button>
                    <div className="h-14 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                    </div>
                    <button 
                        className="h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
                        onPointerDown={() => manualMove({x: 1, y: 0})}
                    >
                        <Zap size={20} fill="currentColor" />
                    </button>

                    <div />
                    <button 
                        className="h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
                        onPointerDown={() => manualMove({x: 0, y: 1})}
                    >
                        <Zap size={20} className="rotate-90" fill="currentColor" />
                    </button>
                    <div />
                </div>
             )}

           </section>

           {/* Section 3: Music Station (Right Column) */}
           <section className="md:col-span-12 lg:col-span-3 flex flex-col gap-4 order-3">
              
              <div className="h-full bg-[#050505]/60 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 shadow-[0_0_20px_rgba(6,182,212,0.1)] flex flex-col items-center justify-center relative overflow-hidden group">
                 
                 {/* Cybernetic Accent Lines */}
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-transparent opacity-50" />
                 <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/50 rounded-br-2xl transition-all group-hover:border-cyan-400" />
                 
                 {/* Visualizer Backdrop - adjusted for smaller screen */}
                 <div className="absolute top-0 left-0 w-full h-[50%] flex items-end justify-center px-2 gap-0.5 opacity-30" style={{ maskImage: 'linear-gradient(to bottom, black, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)'}}>
                    {visualizerState.map((h, i) => (
                       <div key={i} className="flex-1 bg-cyan-400 rounded-t-sm transition-all duration-75 mix-blend-screen" style={{ height: `${h}%` }} />
                    ))}
                 </div>
                 
                 {/* Compact Futuristic Disc Cover */}
                 <div className="w-32 h-32 rounded-full bg-black border-2 border-white/5 relative overflow-hidden mb-4 mt-2 shadow-[0_0_20px_rgba(6,182,212,0.15)] group/disc">
                    <img 
                       src={currentTrack.cover} 
                       alt="Cover" 
                       className={`absolute inset-0 w-full h-full object-cover transition-all ${isPlaying ? 'animate-[spin_4s_linear_infinite] opacity-80' : 'opacity-40 rotate-0'} mix-blend-luminosity`}
                       referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
                    {/* Center ring */}
                    <div className="absolute inset-0 m-auto w-8 h-8 bg-[#050505] border-2 border-white/10 rounded-full z-10 flex items-center justify-center shadow-inner">
                       <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' : 'bg-white/20'}`} />
                    </div>
                 </div>

                 {/* Text Info */}
                 <div className="w-full text-center mb-5 relative z-10">
                    <h2 className="text-sm font-black text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,1)] uppercase tracking-wider">
                      {currentTrack.title}
                    </h2>
                    <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mt-1 opacity-80">
                      {currentTrack.artist}
                    </p>
                 </div>

                 {/* Media Controls */}
                 <div className="w-full flex justify-between items-center px-2 relative z-10 bg-black/40 rounded-xl p-2 border border-white/5">
                    <button 
                      onClick={prevTrack} 
                      className="p-2 text-white/50 hover:text-cyan-400 hover:bg-white/5 rounded-lg transition-all active:scale-90"
                    >
                      <SkipBack size={16} fill="currentColor" />
                    </button>
                    
                    <button 
                      onClick={togglePlay} 
                      className="p-3 text-black bg-cyan-400 hover:bg-white rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_20px_rgba(255,255,255,0.6)] transition-all hover:scale-105 active:scale-95 group"
                    >
                      {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-0.5" />}
                    </button>
                    
                    <button 
                      onClick={nextTrack}
                      className="p-2 text-white/50 hover:text-cyan-400 hover:bg-white/5 rounded-lg transition-all active:scale-90"
                    >
                      <SkipForward size={16} fill="currentColor" />
                    </button>
                 </div>
              </div>

              {/* Volume Handle */}
              <div className="bg-[#050505]/60 backdrop-blur-xl border border-cyan-500/30 rounded-xl px-4 py-3 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">Audio Subsystem</span>
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">{isMuted ? 'Muted' : 'Online'}</span>
                 </div>
                 <button 
                    onClick={toggleMute} 
                    className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-pink-500/20 text-pink-500' : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'}`}
                 >
                    {isMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                 </button>
              </div>

           </section>

        </main>
      </div>

      <audio ref={audioRef} src={currentTrack.url} onEnded={nextTrack} preload="auto" />
    </div>
  );
}
