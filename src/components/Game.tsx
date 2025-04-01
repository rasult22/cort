import { useEffect } from 'react';
import Phaser from 'phaser';
import { GameEngine } from '../game/core/Game';

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load game assets here
    // Load all playing cards
    const suits = ['Hearts', 'Pikes', 'Clovers', 'Tiles'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
    
    this.load.image('test', 'assets/playing_cards/PNG/white/Hearts_A_white.png')
    // suits.forEach(suit => {
    //   values.forEach(value => {
    //     const key = `${suit}_${value}_white`;
    //     this.load.image(key, `assets/playing_cards/PNG/white/${suit}_${value}_white.png`);
    //   });
    // });
    
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
    this.add.image(this.cameras.main.centerX, this.cameras.main.centerY, 'test').setScale(0.1);
    this.add.image(this.cameras.main.centerX + 50, this.cameras.main.centerY, 'test').setScale(0.1);
    this.add.image(this.cameras.main.centerX - 50, this.cameras.main.centerY, 'test').setScale(0.1);
  }

  update() {
    // Game loop logic here
  }
}

const Game = () => {
  useEffect(() => {
    // Initialize the game instance globally
    window.game = new GameEngine(); 
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