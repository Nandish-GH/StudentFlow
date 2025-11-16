// Vanilla JS implementation of animated squares grid for header background
(function(){
  function SquaresBackground(canvas, opts){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.direction = opts.direction || 'right';
    this.baseSpeed = Math.max(opts.speed || 1, 0.1);
    this.speed = this.baseSpeed;
    this.borderColor = opts.borderColor || '#999';
    this.baseSquareSize = opts.squareSize || 40;
    this.squareSize = this.baseSquareSize;
    this.hoverFillColor = opts.hoverFillColor || '#222';

    // Animation parameters
    this.time = 0;
    this.speedRange = opts.speedRange || [0.2, 0.6];
    this.sizeRange = opts.sizeRange || [25, 35];

    this.numSquaresX = 0;
    this.numSquaresY = 0;
    this.gridOffset = {x:0, y:0};
    this.hoveredSquare = null;

    this._resize = this._resize.bind(this);
    this._drawGrid = this._drawGrid.bind(this);
    this._tick = this._tick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    window.addEventListener('resize', this._resize);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseleave', this._onMouseLeave);

    this._resize();
    this._raf = requestAnimationFrame(this._tick);
  }

  SquaresBackground.prototype._resize = function(){
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.numSquaresX = Math.ceil(w / this.squareSize) + 1;
    this.numSquaresY = Math.ceil(h / this.squareSize) + 1;
  };

  SquaresBackground.prototype._drawGrid = function(){
    const ctx = this.ctx;
    const canvas = this.canvas;
    const size = this.squareSize;
    ctx.clearRect(0,0,canvas.width, canvas.height);

    const startX = Math.floor(this.gridOffset.x / size) * size;
    const startY = Math.floor(this.gridOffset.y / size) * size;

    for(let x = startX; x < canvas.width + size; x += size){
      for(let y = startY; y < canvas.height + size; y += size){
        const squareX = x - (this.gridOffset.x % size);
        const squareY = y - (this.gridOffset.y % size);

        if (this.hoveredSquare &&
            Math.floor((x - startX) / size) === this.hoveredSquare.x &&
            Math.floor((y - startY) / size) === this.hoveredSquare.y){
          ctx.fillStyle = this.hoverFillColor;
          ctx.fillRect(squareX, squareY, size, size);
        }

        ctx.strokeStyle = this.borderColor;
        ctx.strokeRect(squareX, squareY, size, size);
      }
    }

    // soft radial gradient vignette
    const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, Math.sqrt(canvas.width**2 + canvas.height**2)/2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width, canvas.height);
  };

  SquaresBackground.prototype._tick = function(){
    // Animate speed and size over time
    this.time += 0.003;
    const sineWave = Math.sin(this.time);
    
    // Interpolate speed and size based on sine wave
    this.speed = this.speedRange[0] + (this.speedRange[1] - this.speedRange[0]) * (sineWave * 0.5 + 0.5);
    this.squareSize = this.sizeRange[0] + (this.sizeRange[1] - this.sizeRange[0]) * (sineWave * 0.5 + 0.5);
    
    const size = this.squareSize;
    const s = this.speed;
    switch(this.direction){
      case 'right':
        this.gridOffset.x = (this.gridOffset.x - s + size) % size; break;
      case 'left':
        this.gridOffset.x = (this.gridOffset.x + s + size) % size; break;
      case 'up':
        this.gridOffset.y = (this.gridOffset.y + s + size) % size; break;
      case 'down':
        this.gridOffset.y = (this.gridOffset.y - s + size) % size; break;
      case 'diagonal':
        this.gridOffset.x = (this.gridOffset.x - s + size) % size;
        this.gridOffset.y = (this.gridOffset.y - s + size) % size;
        break;
    }
    this._drawGrid();
    this._raf = requestAnimationFrame(this._tick);
  };

  SquaresBackground.prototype._onMouseMove = function(e){
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const size = this.squareSize;
    const startX = Math.floor(this.gridOffset.x / size) * size;
    const startY = Math.floor(this.gridOffset.y / size) * size;
    const hoveredSquareX = Math.floor((mouseX + this.gridOffset.x - startX) / size);
    const hoveredSquareY = Math.floor((mouseY + this.gridOffset.y - startY) / size);
    if (!this.hoveredSquare || this.hoveredSquare.x !== hoveredSquareX || this.hoveredSquare.y !== hoveredSquareY){
      this.hoveredSquare = {x: hoveredSquareX, y: hoveredSquareY};
    }
  };

  SquaresBackground.prototype._onMouseLeave = function(){
    this.hoveredSquare = null;
  };

  // Init on DOM ready
  function initSquares() {
    const canvas = document.getElementById('header-squares');
    if (!canvas) return;
    new SquaresBackground(canvas, {
      direction: 'diagonal',
      speed: 0.3,
      borderColor: 'rgba(255,255,255,0.25)',
      squareSize: 30,
      hoverFillColor: 'rgba(255,255,255,0.12)',
      speedRange: [0.2, 0.6],
      sizeRange: [25, 35]
    });
  }

  document.addEventListener('DOMContentLoaded', initSquares);
  
  // Expose init function globally for manual refresh
  window.initSquaresBackground = initSquares;
})();
