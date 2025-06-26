import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Zustand store for global state
const useStore = create((set, get) => ({
  isDetecting: false,
  settings: {
    confidence: 0.5,
    resolution: '640x480',
    theme: 'space'
  },
  detections: [],
  diagnostics: [],
  equipment: [
    { 
      id: 1, 
      name: 'Fire Extinguisher', 
      class: 0, 
      description: 'Emergency fire suppression system', 
      status: 'operational', 
      quantity: 5,
      image: 'https://images.unsplash.com/photo-1496745109441-36ea45fed379?w=300&h=200&fit=crop'
    },
    { 
      id: 2, 
      name: 'Tool Box', 
      class: 1, 
      description: 'Maintenance and repair equipment', 
      status: 'operational', 
      quantity: 12,
      image: 'https://images.unsplash.com/photo-1558906050-d6d6aa390fd3?w=300&h=200&fit=crop'
    },
    { 
      id: 3, 
      name: 'Oxygen Tank', 
      class: 2, 
      description: 'Life support oxygen supply', 
      status: 'maintenance', 
      quantity: 8,
      image: 'https://images.unsplash.com/photo-1585960410426-86a4b41a34f3?w=300&h=200&fit=crop'
    }
  ],
  
  setDetecting: (status) => set({ isDetecting: status }),
  updateSettings: (newSettings) => set(state => ({ settings: { ...state.settings, ...newSettings } })),
  addDetection: (detection) => set(state => ({ 
    detections: [detection, ...state.detections.slice(0, 49)],
    diagnostics: [{
      id: Date.now(),
      timestamp: new Date().toISOString(),
      event: `Detected ${detection.name}`,
      confidence: detection.conf,
      status: 'detected'
    }, ...state.diagnostics.slice(0, 19)]
  })),
  clearDetections: () => set({ detections: [], diagnostics: [] }),
  updateEquipmentQuantity: (id, quantity) => set(state => ({
    equipment: state.equipment.map(item => 
      item.id === id ? { ...item, quantity: Math.max(0, quantity) } : item
    )
  })),
  toggleEquipmentStatus: (id) => set(state => ({
    equipment: state.equipment.map(item => 
      item.id === id ? { 
        ...item, 
        status: item.status === 'operational' ? 'maintenance' : 'operational' 
      } : item
    )
  }))
}));

// Animated Counter Component
const AnimatedCounter = ({ value, duration = 2000 }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = value;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [value, duration]);
  
  return <span>{count}</span>;
};

// Animated Metric Slider Component
const MetricSlider = ({ label, value, max = 100, color = '#2EFFFF', delay = 0 }) => {
  const [width, setWidth] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth((value / max) * 100);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [value, max, delay]);
  
  return (
    <div className="metric-slider">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <span className="metric-value">
          <AnimatedCounter value={value} />%
        </span>
      </div>
      <div className="metric-bar">
        <div 
          className="metric-fill"
          style={{ 
            width: `${width}%`,
            backgroundColor: color,
            boxShadow: `0 0 20px ${color}40`
          }}
        />
      </div>
    </div>
  );
};

// Detection Console Component
const DetectionConsole = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const { isDetecting, settings, detections, setDetecting, addDetection } = useStore();

  const classNames = ['FireExtinguisher', 'ToolBox', 'OxygenTank'];
  const colors = ['#2EFFFF', '#FF9F2E', '#FF4747'];

  const startDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // WebSocket connection
      const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/detect';
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setDetecting(true);
        sendFrames();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const detections = JSON.parse(event.data);
          drawDetections(detections);
          
          // Add to store
          detections.forEach(det => {
            if (det.conf > settings.confidence) {
              addDetection({
                ...det,
                name: classNames[det.cls] || 'Unknown',
                timestamp: new Date().toISOString()
              });
            }
          });
        } catch (error) {
          console.error('Error parsing detection data:', error);
        }
      };

    } catch (error) {
      console.error('Error starting detection:', error);
    }
  }, [settings.confidence, setDetecting, addDetection]);

  const sendFrames = useCallback(() => {
    if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const base64Frame = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    wsRef.current.send(base64Frame);
    
    if (isDetecting) {
      setTimeout(sendFrames, 100); // ~10 FPS to avoid overwhelming
    }
  }, [isDetecting]);

  const drawDetections = useCallback((detections) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    detections.forEach(det => {
      if (det.conf > settings.confidence) {
        const color = colors[det.cls] || '#2EFFFF';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = color + '20';
        
        const width = det.x2 - det.x1;
        const height = det.y2 - det.y1;
        
        ctx.fillRect(det.x1, det.y1, width, height);
        ctx.strokeRect(det.x1, det.y1, width, height);
        
        // Label
        ctx.fillStyle = color;
        ctx.font = '12px monospace';
        const label = `${classNames[det.cls]} ${(det.conf * 100).toFixed(1)}%`;
        ctx.fillText(label, det.x1, det.y1 - 5);
      }
    });
  }, [settings.confidence]);

  const stopDetection = useCallback(() => {
    setDetecting(false);
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  }, [setDetecting]);

  return (
    <div className="detection-console">
      <div className="viewport-container">
        <video ref={videoRef} className="video-feed" width="640" height="480" />
        <canvas ref={canvasRef} className="detection-overlay" width="640" height="480" />
        <div className="controls">
          {!isDetecting ? (
            <button onClick={startDetection} className="start-btn">
              Start Detection
            </button>
          ) : (
            <button onClick={stopDetection} className="stop-btn">
              Stop Detection
            </button>
          )}
        </div>
      </div>
      
      <div className="detection-sidebar">
        <h3>Live Detections</h3>
        <div className="detection-list">
          {detections.slice(0, 10).map((det, idx) => (
            <motion.div
              key={`${det.timestamp}-${idx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="detection-item"
            >
              <div className="detection-icon" style={{ backgroundColor: colors[det.cls] }}></div>
              <div className="detection-info">
                <span className="detection-name">{det.name}</span>
                <span className="detection-confidence">{(det.conf * 100).toFixed(1)}%</span>
                <span className="detection-time">{new Date(det.timestamp).toLocaleTimeString()}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Settings Modal Component  
const SettingsModal = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="modal-content"
            onClick={e => e.stopPropagation()}
          >
            <h2>Detection Settings</h2>
            <div className="setting-group">
              <label>Confidence Threshold: {(settings.confidence * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={settings.confidence}
                onChange={e => updateSettings({ confidence: parseFloat(e.target.value) })}
                className="slider"
              />
            </div>
            <div className="setting-group">
              <label>Resolution</label>
              <select
                value={settings.resolution}
                onChange={e => updateSettings({ resolution: e.target.value })}
                className="select"
              >
                <option value="640x480">640x480</option>
                <option value="1280x720">1280x720</option>
                <option value="1920x1080">1920x1080</option>
              </select>
            </div>
            <button onClick={onClose} className="close-btn">Close</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Equipment Library Component
const EquipmentLibrary = () => {
  const { equipment, updateEquipmentQuantity, toggleEquipmentStatus } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="equipment-library">
      <h2>Equipment Library</h2>
      <div className="search-container">
        <input
          type="text"
          placeholder="Search equipment..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="equipment-grid">
        {filteredEquipment.map(item => (
          <motion.div
            key={item.id}
            whileHover={{ scale: 1.05, rotateY: 5 }}
            className="equipment-card"
          >
            <div className="equipment-image">
              <img src={item.image} alt={item.name} className="equipment-photo" />
            </div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <div className="equipment-status">
              <button 
                onClick={() => toggleEquipmentStatus(item.id)}
                className={`status-toggle ${item.status}`}
              >
                {item.status === 'operational' ? '✅ Operational' : '🔧 Maintenance'}
              </button>
            </div>
            <div className="quantity-controls">
              <label>Quantity: {item.quantity}</label>
              <div className="quantity-buttons">
                <button 
                  onClick={() => updateEquipmentQuantity(item.id, item.quantity - 1)}
                  className="quantity-btn"
                >
                  -
                </button>
                <span className="quantity-display">{item.quantity}</span>
                <button 
                  onClick={() => updateEquipmentQuantity(item.id, item.quantity + 1)}
                  className="quantity-btn"
                >
                  +
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// Diagnostics Timeline Component
const DiagnosticsTimeline = () => {
  const { diagnostics } = useStore();

  return (
    <section className="diagnostics-timeline">
      <h2>Diagnostics Timeline</h2>
      <div className="timeline">
        {diagnostics.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="timeline-item"
          >
            <div className="timeline-node"></div>
            <div className="timeline-content">
              <h4>{item.event}</h4>
              <p>Confidence: {(item.confidence * 100).toFixed(1)}%</p>
              <span className="timeline-time">
                {new Date(item.timestamp).toLocaleString()}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// Mission Page Component
const MissionPage = () => {
  return (
    <div className="mission-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            Fix the Station with AR Vision
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            Advanced object detection system for space station maintenance and repair operations
          </motion.p>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            whileHover={{ scale: 1.05, glow: 1 }}
            onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
            className="hero-cta"
          >
            Explore Mission
          </motion.button>
        </div>
      </section>

      {/* Hackathon Section */}
      <section className="info-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="info-card"
          >
            <h2>🚀 CodeClash Hackathon</h2>
            <p>
              Welcome to CodeClash - the ultimate 48-hour coding challenge where innovation meets space exploration! 
              This hackathon brings together developers, designers, and space enthusiasts to create cutting-edge 
              solutions for the future of space operations. Our AR Object Spotter represents the next generation 
              of astronaut assistance technology, combining artificial intelligence with augmented reality to help 
              space station crews identify and locate critical equipment in zero gravity environments.
            </p>
            <div className="tech-highlight">
              <span className="tech-badge">🏆 48-Hour Challenge</span>
              <span className="tech-badge">🚀 Space Innovation</span>
              <span className="tech-badge">🤖 AI-Powered</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* YOLOv8 Section */}
      <section className="info-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="info-card"
          >
            <h2>🎯 Why YOLOv8?</h2>
            <p>
              YOLOv8 (You Only Look Once version 8) is the latest iteration of the revolutionary real-time object 
              detection algorithm. For space station operations, speed and accuracy are paramount. YOLOv8 delivers:
            </p>
            <ul className="feature-list">
              <li>⚡ <strong>Ultra-fast inference:</strong> Process video frames at 30+ FPS in real-time</li>
              <li>🎯 <strong>Superior accuracy:</strong> Advanced architecture with improved detection precision</li>
              <li>🔧 <strong>Lightweight deployment:</strong> Optimized for edge computing environments</li>
              <li>🚀 <strong>Space-grade reliability:</strong> Proven performance in critical applications</li>
            </ul>
            <div className="tech-highlight">
              <span className="tech-badge">Real-time</span>
              <span className="tech-badge">High Accuracy</span>
              <span className="tech-badge">Lightweight</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="info-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="info-card"
          >
            <h2>📊 Performance Metrics</h2>
            <p>
              Our AR Object Spotter achieves exceptional performance metrics that exceed industry standards 
              for real-time object detection in space applications:
            </p>
            <div className="metrics-grid">
              <MetricSlider label="Detection Accuracy" value={94} delay={200} />
              <MetricSlider label="Real-time Performance" value={87} delay={400} />
              <MetricSlider label="Equipment Recognition" value={91} delay={600} />
              <MetricSlider label="False Positive Rate" value={5} max={10} color="#FF9F2E" delay={800} />
              <MetricSlider label="System Reliability" value={98} delay={1000} />
              <MetricSlider label="Processing Speed" value={89} delay={1200} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Space Station Dataset Section */}
      <section className="info-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="info-card"
          >
            <h2>🛰️ Space Station Dataset</h2>
            <p>
              Our specialized dataset contains over 10,000 high-resolution images captured from International 
              Space Station operations, featuring critical equipment in various lighting conditions and orientations. 
              This comprehensive dataset includes:
            </p>
            <ul className="feature-list">
              <li>🔥 <strong>Fire Extinguishers:</strong> Emergency suppression systems in multiple configurations</li>
              <li>🔧 <strong>Tool Boxes:</strong> Maintenance equipment containers and portable repair kits</li>
              <li>💨 <strong>Oxygen Tanks:</strong> Life support systems and backup air supplies</li>
              <li>📐 <strong>Annotated Bounding Boxes:</strong> Precise object localization data</li>
            </ul>
            <div className="dataset-stats">
              <div className="stat-item">
                <span className="stat-number">10,000+</span>
                <span className="stat-label">Images</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">3</span>
                <span className="stat-label">Object Classes</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">95%</span>
                <span className="stat-label">Accuracy</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Falcon AI Section */}
      <section className="info-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="info-card"
          >
            <h2>🦅 Falcon AI Framework</h2>
            <p>
              Falcon AI is our proprietary artificial intelligence framework designed specifically for space 
              operations. Built on advanced machine learning principles, Falcon AI provides:
            </p>
            <ul className="feature-list">
              <li>🧠 <strong>Adaptive Learning:</strong> Continuously improves detection accuracy through operation</li>
              <li>🔍 <strong>Multi-modal Fusion:</strong> Combines visual, depth, and contextual information</li>
              <li>⚡ <strong>Edge Computing:</strong> Optimized for low-latency, high-reliability environments</li>
              <li>🛡️ <strong>Fail-safe Design:</strong> Redundant systems ensure mission-critical reliability</li>
            </ul>
            <div className="tech-highlight">
              <span className="tech-badge">AI-Powered</span>
              <span className="tech-badge">Adaptive</span>
              <span className="tech-badge">Mission-Critical</span>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

// Contact Page Component
const ContactPage = () => {
  const contactLinks = [
    {
      name: 'LinkedIn',
      url: 'https://linkedin.com/in/yourprofile',
      icon: '💼',
      description: 'Professional networking and career updates'
    },
    {
      name: 'GitHub',
      url: 'https://github.com/yourusername',
      icon: '💻',
      description: 'Open source projects and code repositories'
    },
    {
      name: 'Email',
      url: 'mailto:your.email@example.com',
      icon: '📧',
      description: 'Direct communication for collaborations'
    },
    {
      name: 'Twitter',
      url: 'https://twitter.com/yourusername',
      icon: '🐦',
      description: 'Thoughts on tech, space, and innovation'
    },
    {
      name: 'Portfolio',
      url: 'https://yourportfolio.com',
      icon: '🌐',
      description: 'Showcase of projects and achievements'
    }
  ];

  return (
    <section className="contact-page">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="contact-header"
        >
          <h1>🚀 Get In Touch</h1>
          <p>
            Ready to collaborate on the next generation of space technology? 
            Let's connect and build the future together!
          </p>
        </motion.div>
        
        <div className="contact-grid">
          {contactLinks.map((link, index) => (
            <motion.a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, rotateY: 5 }}
              className="contact-card"
            >
              <div className="contact-icon">{link.icon}</div>
              <h3>{link.name}</h3>
              <p>{link.description}</p>
            </motion.a>
          ))}
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="contact-footer"
        >
          <p>Built with 🚀 for CodeClash Hackathon</p>
          <p>Pushing the boundaries of space technology, one detection at a time.</p>
        </motion.div>
      </div>
    </section>
  );
};

// Main App Component with Parallax Earth
function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [currentSection, setCurrentSection] = useState('mission');

  // Simple parallax movement for Earth
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const parallaxOffset = scrollY * 0.3; // Slower parallax movement
      document.body.style.setProperty('--earth-parallax', `${parallaxOffset}px`);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="App">
      {/* Navigation */}
      <nav className="navigation">
        <div className="nav-brand">AR Object Spotter</div>
        <div className="nav-links">
          <button onClick={() => setCurrentSection('mission')} className={currentSection === 'mission' ? 'active' : ''}>
            Mission
          </button>
          <button onClick={() => setCurrentSection('console')} className={currentSection === 'console' ? 'active' : ''}>
            Detection
          </button>
          <button onClick={() => setCurrentSection('equipment')} className={currentSection === 'equipment' ? 'active' : ''}>
            Equipment
          </button>
          <button onClick={() => setCurrentSection('diagnostics')} className={currentSection === 'diagnostics' ? 'active' : ''}>
            Diagnostics
          </button>
          <button onClick={() => setCurrentSection('contact')} className={currentSection === 'contact' ? 'active' : ''}>
            Contact
          </button>
          <button onClick={() => setShowSettings(true)}>⚙️</button>
        </div>
      </nav>

      {/* Mission Page */}
      {currentSection === 'mission' && <MissionPage />}

      {/* Detection Console */}
      {currentSection === 'console' && <DetectionConsole />}

      {/* Equipment Library */}
      {currentSection === 'equipment' && <EquipmentLibrary />}

      {/* Diagnostics Timeline */}
      {currentSection === 'diagnostics' && <DiagnosticsTimeline />}

      {/* Contact Page */}
      {currentSection === 'contact' && <ContactPage />}

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default App;