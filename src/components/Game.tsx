import { useEffect } from 'react';
import Phaser from 'phaser';

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load game assets here
  }

  create() {
    this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      'Hello Phaser!',
      {
        color: '#ffffff',
        fontSize: '32px'
      }
    ).setOrigin(0.5);
  }

  update() {
    // Game loop logic here
  }
}

const Game = () => {
  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: 'game-container',
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH,
        min: {
          width: 320,
          height: 480
        },
        max: {
          width: 1920,
          height: 1080
        }
      },
      backgroundColor: '#2d2d2d',
      scene: MainScene,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 300, x: 0 },
          debug: false
        }
      },
      render: {
        pixelArt: false,
        antialias: true,
        roundPixels: false
      },
      dom: {
        createContainer: true
      }
    };

    const game = new Phaser.Game(config);

    // Handle window resize
    const resizeGame = () => {
      game.scale.resize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', resizeGame);
    window.addEventListener('orientationchange', resizeGame);

    return () => {
      window.removeEventListener('resize', resizeGame);
      window.removeEventListener('orientationchange', resizeGame);
      game.destroy(true);
    };
  }, []);

  return <div id="game-container" className="w-full h-full" />;
};

export default Game; 