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
    this.add.text(400, 300, 'Hello Phaser!', {
      color: '#ffffff',
      fontSize: '32px'
    }).setOrigin(0.5);
  }

  update() {
    // Game loop logic here
  }
}

const Game = () => {
  useEffect(() => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      backgroundColor: '#2d2d2d',
      scene: MainScene,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 300, x: 0 },
          debug: false
        }
      }
    };

    const game = new Phaser.Game(config);

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div id="game-container" className="w-full h-full" />;
};

export default Game; 