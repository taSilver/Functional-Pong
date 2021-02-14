import { interval, fromEvent, merge as mergeS, iif, BehaviorSubject } from 'rxjs'
import { map, scan, filter, merge, switchMap, startWith, withLatestFrom } from 'rxjs/operators'

type Event = 'keydown' | 'keyup'
type Key = 'ArrowUp' | 'ArrowDown' | 'KeyR' | 'Escape'

function pong() {
  // Inside this function you will use the classes and functions 
  // from rx.js
  // to add visuals to the svg element in pong.html, animate them, and make them interactive.
  // Study and complete the tasks in observable examples first to get ideas.
  // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
  // You will be marked on your functional programming style
  // as well as the functionality that you implement.
  // Document your code!
  type Body = Obj & Readonly<{
    /* Represents Moveable Object */
    yDir: number,
    xDir: number,
    xScale: number,
    yScale: number
    speed: number,
    id: Ids
  }>
  type Ids = "ball" | "playerPaddle" | "computerPaddle" //Represents valid ids of Body Objects to allow for type checking later
  type PowerUpBody = Obj & Readonly<{
    /* Represents PowerUp Object */
    ticksLeft: number,
    effect: PowerUpEffects,
    fill: "red" | "white" | "grey" | "green",
    stroke: "black"
    affects: Ids
  }>
  type PowerUpEffects = Readonly<{
    /* Represents the multiplier effects of a given powerUp */
    xScale: number,
    yScale: number,
    speed: number
  }>
  type Obj = Readonly<{
    /* Represents Object within the SVG */
    x: number,
    y: number,
    width: number,
    height: number
  }>
  type State = Readonly<{
    /* Represents the current game state */
    ball: Body,
    playerPaddle: Body,
    playerScore: number,
    computerPaddle: Body,
    computerScore: number,
    gameState: 'play' | 'winner' | 'finished', //Represents possible game states, winner is buffer stage before finished to allow game over text to be displayed only once
    colourPalette: ColourPalette,
    shownPowerUps: PowerUp[],
    activePowerUps: PowerUp[],
    queuedPowerUp: PowerUp | null
  }>
  type ColourPalette = Readonly<{
    /* Represents a colour palette for the board, each colour should be a CSS recognizable pattern for a colour */
    bg: string,
    player: string,
    computer: string,
    ball: string,
    name: string
  }>

  //These objects below have been defined as classes to allow instanceof checking later, as this cannot be done with custom classes
  class YDirection { constructor(public readonly direction: number) { } } //Represents how fast and in what direction in the Y-Axis a Body is moving
  class Tick { constructor(public readonly elapsed: number) { } } //Represents a game tick
  class PowerUp { constructor(public readonly powerUp: PowerUpBody) { } } //Wrapper for PowerUpBody, kept separate for PowerUpBody to make use of inheritance of Obj in it
  class MousePos { constructor(public readonly y: number) { } } //Represents Y pos of mouse
  class RNG { /* Attempt at a pure random number generator, inspiration taken from the Week 5 workshop */
    // LCG using Numerical Recipes's constants, shifted from GCC constants for 'better' randomness
    private readonly m = 0x80000000// 2**31
    private readonly a = 1664525
    private readonly c = 1013904223
    private readonly generator:BehaviorSubject<number>
    constructor(readonly seed:number){
      this.generator = new BehaviorSubject((this.a * seed + this.c) % this.m) /* Set initial value of the behavior subject  */
    }

    private nextVal(): number{ /* Sets next value of Behavior subject */
      this.generator.next((this.a * this.generator.getValue() + this.c) % this.m)
      return this.generator.getValue()
    }

    nextInt(upperBound:number, randVal=this.nextVal()): number{ /* Generates random int bound by given val */
      return Math.round((randVal)/ (this.m - 1) * upperBound)
    }

    nextBoolean(randVal=this.nextInt(1)): boolean{ /* Generates random boolean */
      return randVal == 1
    }
  }
  const rng = new RNG(2102)

  const Constants = new class {
    /* Contains constant values, initial stats and 'magic' numbers */
    readonly marginOfError: number = 3; //A 'magic' number for how many pixels leeway for scoring goals, AI to move etc.
    readonly svg: HTMLElement = document.getElementById("canvas");
    readonly canvasSize: number = Number(this.svg.getAttribute("width"));
    readonly center: number = Math.round(this.canvasSize / 2);
    readonly svgY: number = this.svg.getBoundingClientRect().y; //Y pos of the svg on the page
    readonly maxScore: number = 7;
    readonly bounceSections: number = 7; //How many sections from the center the paddle is divided into for bounce angles, further away from center, higher the velocity
    readonly effectStrength: number = 0.25; //Multiplier applied to all power up effects
    readonly powerUpLife: number = 3000; //How many ticks a power up will be in game for
    readonly powerUpDimensions: number = 20; //Width and Height of power ups
    readonly initialPlayerState: Body = { id: "playerPaddle", x: 590, y: 280, width: 10, height: 70, yDir: 0, xDir: 0, speed: 6, xScale: 1, yScale: 1 };
    readonly initialComputerState: Body = { id: "computerPaddle", x: 0, y: 280, width: 10, height: 70, yDir: 0, xDir: 0, speed: 6, xScale: 1, yScale: 1 };
    readonly initialBallState: Body = { id: "ball", x: this.center, y: rng.nextInt(500) + 25, height: 5, width: 5, yDir: 0, xDir: 0, speed: 2, xScale: 1, yScale: 1 };//Offset y to prevent ball getting trapped along side of walls on spawn
    readonly leftWall: Obj = { x: 0, y: 0, width: this.marginOfError, height: this.canvasSize };
    readonly rightWall: Obj = { x: this.canvasSize, y: 0, width: this.marginOfError, height: this.canvasSize };
    readonly topWall: Obj = { x: 0, y: 0, width: this.canvasSize, height: this.marginOfError };
    readonly bottomWall: Obj = { x: 0, y: this.canvasSize, width: this.canvasSize, height: this.marginOfError };
    readonly colourPalettes: ColourPalette[] = [
      {
        bg: "black",
        player: "white",
        computer: "white",
        ball: "white",
        name: "Classic"
      },
      {
        bg: "#A8DADC",
        player: "#457B9D",
        computer: "#E63946",
        ball: "#F1FAEE",
        name: "Beach side"
      },
      {
        bg: "#03071E",
        player: "#9D0208",
        computer: "#DC2F02",
        ball: "#FFBA08",
        name: "Fire"
      },
      {
        bg: "#734f96",
        player: "#C0FDFF",
        computer: "#FFCBF2",
        ball: "white",
        name: "Lavender"
      },
      {
        bg: "#081C15",
        player: "#40916C",
        computer: "#74C69D",
        ball: "#d8f3dc",
        name: "Natural"
      },
      {
        bg: "#2d00f7",
        player: "#f20089",
        computer: "#39ff14",
        ball: "white",
        name: "Neon"
      },
      {
        bg: "#1b4965",
        player: "#0f80aa",
        computer: "#20bac5",
        ball: "white",
        name: "Ocean"
      },
      {
        bg: "#b8bedd",
        player: "#f0a6ca",
        computer: "#efc3e6",
        ball: "#f0e6ef",
        name: "Pastel"
      },
      {
        bg: "white",
        player: "black",
        computer: "black",
        ball: "black",
        name: "Inverted"
      }

    ]
    readonly initialState: State = {
      ball: this.initialBallState,
      playerPaddle: this.initialPlayerState,
      playerScore: 0,
      computerPaddle: this.initialComputerState,
      computerScore: 0,
      gameState: 'play',
      colourPalette: this.colourPalettes[0],
      shownPowerUps: [],
      activePowerUps: [],
      queuedPowerUp: null
    };
  },
    attr = (e: Element, o: any) => { //helper function to populate a HTMLElement with attributes, as per the asteroids example
      for (const k in o) e.setAttribute(k, String(o[k]))
    }

  const reduceState = (s: State, e: YDirection | Tick | MousePos | PowerUp) => {
    /* Handle all possible events that are able to occur on the state */
    return e instanceof Tick ? handleCollisions({
      ...s,
      playerPaddle: applyPowerUps(s.activePowerUps)(reduceBody(s.playerPaddle, e)),
      ball: applyPowerUps(s.activePowerUps)(reduceBody(s.ball, e)),
      computerPaddle: {
        ...applyPowerUps(s.activePowerUps)(reduceBody(s.computerPaddle, e)),
        // Added middle of paddle to ensure accurate aiming for AI, but also subtracted margin of error to ensure doesn't deadlock game into straight hits
        yDir: -convertPosToDir(s.ball, s.computerPaddle.y + bodyYMid(s.computerPaddle), bodyYMid(s.computerPaddle)).direction
      },
      shownPowerUps: reducePowerUps(s.queuedPowerUp ? s.shownPowerUps.concat(s.queuedPowerUp) : s.shownPowerUps), //add power up if in queue
      activePowerUps: reducePowerUps(s.activePowerUps),
      queuedPowerUp: e instanceof Tick && s.queuedPowerUp ? null : s.queuedPowerUp, //remove power up from queue on tick
    }) : e instanceof PowerUp ? {
      ...s,
      queuedPowerUp: e  //Add power up to queue
    } : { //If this section is reached, must be a YDirection or MousePos, this will only be applicable to playerPaddle
      ...s,
      playerPaddle: reduceBody(s.playerPaddle, e) //Handling of YDirection/MousePos
    }
  },
    reducePowerUps = (powerUps: PowerUp[]): PowerUp[] => {
      /* Reduces the ticks left on all active powerups, removes powerups that are no longer active */
      return powerUps
        .map(powerUpObj => new PowerUp({ ...powerUpObj.powerUp, ticksLeft: powerUpObj.powerUp.ticksLeft - 1 }))
        .filter(powerUpObj => powerUpObj.powerUp.ticksLeft > 0)
    },
    reduceBody = (s: Body, e: YDirection | MousePos | Tick) => {
      /* Reduce a body object given an event */
      return e instanceof YDirection ? {
        ...s,
        yDir: e.direction
      } : e instanceof MousePos ? {
        ...s,
        y:Math.min(e.y - bodyYMid(s), Constants.canvasSize-(bodyYMid(s)*2)) //always move to center of paddle
      } :
        {
          ...s,
          y: withinCanvas(s.y, s.yDir + (s.speed * Math.sign(s.yDir)), bodyYMid(s) * 2),
          x: withinCanvas(s.x, s.xDir + (s.speed * Math.sign(s.xDir)), bodyXMid(s) * 2)
        }
    },
    applyPowerUps = (powerUps: PowerUp[]) => (s: Body): Body => {
      /* Filter active powerups for which body it affects, then reduce it to see current affect, and apply it*/
      const effects: PowerUpEffects = {
        xScale: powerUps.filter(({ powerUp }) => powerUp.affects == s.id).reduce((a, v) => a * v.powerUp.effect.xScale, 1),
        yScale: powerUps.filter(({ powerUp }) => powerUp.affects == s.id).reduce((a, v) => a * v.powerUp.effect.yScale, 1),
        speed: powerUps.filter(({ powerUp }) => powerUp.affects == s.id).reduce((a, v) => a * v.powerUp.effect.speed, 1)
      },
        initialState = initialStateFromId(s.id)
      return {
        ...s,
        xScale: effects.xScale * initialState.xScale,
        yScale: effects.yScale * initialState.yScale,
        speed: effects.speed * initialState.speed
      }
    },
    handleCollisions = (s: State) => {
      /* Handles effects that result  */
      const velocity: { x: number, y: number } = getBallVelocity(s),
        goalScored: boolean = [Constants.leftWall, Constants.rightWall].some(collidesWith(s.ball)),
        changeColor: boolean = [Constants.topWall, Constants.bottomWall, Constants.rightWall, Constants.leftWall, s.playerPaddle, s.computerPaddle].some(collidesWith(s.ball))
      return {
        ...s,
        ball: {
          ...s.ball,
          //If goal is scored, randomly pick a y within 50-550, move x to center, and set velocities to 0 for slight breather before ball moves again
          x: goalScored ? Constants.center : s.ball.x,
          y: goalScored ? rng.nextInt(500) + 50 : s.ball.y,
          xDir: !goalScored ? velocity.x : 0,
          yDir: !goalScored ? velocity.y : 0
        },
        playerScore: s.playerScore + (collidesWith(s.ball)(Constants.leftWall) ? 1 : 0),
        computerScore: s.computerScore + (collidesWith(s.ball)(Constants.rightWall) ? 1 : 0),
        gameState: Math.max(s.playerScore, s.computerScore) >= Constants.maxScore && s.gameState === 'play'
          ? 'winner'
          : s.gameState === 'winner'
            ? 'finished'
            : s.gameState,
        colourPalette: changeColor //Change colour if ball is hit, and select a random option out of colour palettes
          ? Constants.colourPalettes[rng.nextInt(Constants.colourPalettes.length - 1)]
          : s.colourPalette,
        activePowerUps: s.activePowerUps.filter(powerUpObj => powerUpObj.powerUp.ticksLeft > 0)
          .concat(s.shownPowerUps.filter(powerUp => collidesWith(s.ball)(powerUp.powerUp))),
        shownPowerUps: s.shownPowerUps.filter(powerUp => !collidesWith(s.ball)(powerUp.powerUp))
      }
    },
    getBallVelocity = (s: State): { x: number, y: number } => {
      /* Checks collisions with either paddles or upper and lower walls, and calculates ball velocity */
      const collidesWithBall = collidesWith(s.ball),
        collidedPaddle = collidesWithBall(s.playerPaddle)
          ? s.playerPaddle
          : collidesWithBall(s.computerPaddle)
            ? s.computerPaddle
            : null,
        wallHit: boolean = [Constants.topWall, Constants.bottomWall].some(collidesWithBall)

      if (collidedPaddle) {
        // Divide paddle into sections based on height, and check which section the ball hit, inspiration from https://gamedev.stackexchange.com/questions/4253/in-pong-how-do-you-calculate-the-balls-direction-when-it-bounces-off-the-paddl
        const paddleMiddle = collidedPaddle.y + bodyYMid(collidedPaddle),
          ballMiddle = s.ball.y + bodyYMid(s.ball),
          relativeYIntersect = ballMiddle - paddleMiddle,
          normalizedYIntersect = relativeYIntersect / bodyYMid(collidedPaddle),
          bounceAngle = Math.round(normalizedYIntersect * Constants.bounceSections),
          sideOfField = Math.sign(collidedPaddle.x - Constants.center)
        return { x: Math.abs(s.ball.xDir) * -sideOfField, y: bounceAngle } //Constantly ensures ball is moving in right direction off paddle to avoid getting stuck
      } else if (wallHit) {
        //Instead of simply flipping y sign, ensures it's constantly pointing towards center of field during a wall hit to prevent getting stuck in wall
        return { x: s.ball.xDir, y: Math.abs(s.ball.yDir) * Math.sign(Constants.center - s.ball.y) }
      } else if (s.ball.xDir == 0 && s.ball.yDir == 0) {
        return { x: s.ball.speed * (rng.nextBoolean() ? -1 : 1), y: s.ball.speed * (rng.nextBoolean() ? -1 : 1) }
      }
      return { x: s.ball.xDir, y: s.ball.yDir }
    }

  // Below contains majority of the observable streams for the game, observable streams have $ at the end of the variable name, as per convention
  const
    mouseOver$ = mergeS(fromEvent<MouseEvent>(Constants.svg, "mouseenter"), fromEvent<MouseEvent>(Constants.svg, "mouseleave"))
      .pipe(
        map(({ type }) => type === "mouseenter"),
        startWith(false)
      ),
    mouseMove$ = fromEvent<MouseEvent>(document, "mousemove") //Maps mouse movements to relative movements in canvas
    .pipe(
      map(({ clientY }) => new MousePos(Math.round(clientY - Constants.svgY))),
    ),
    getMousePos$ = interval(10) //Checks if mouse is over canvas, if so, switches to keyboard
      .pipe(
        withLatestFrom(mouseMove$, mouseOver$),
        filter(([_, __, hover,]) => hover),
        map(([_, val, __]) => val)
      ),
    observeKey = <T>(eventName: Event, k: Key, result: () => T) => //observeKey constructor similar to the asteroids example provided
      fromEvent<KeyboardEvent>(document, eventName)
        .pipe(
          filter(({ code }) => code === k),
          filter(({ repeat }) => !repeat),
          withLatestFrom(mouseOver$), //included latest from mouseOver to check that mouse is over canvas to not register press
          filter(([_, hover]) => !hover),
          map(result)
        ),
    moveUp$ = mergeS(observeKey('keydown', 'ArrowUp', () => new YDirection(-1)), observeKey('keyup', 'ArrowUp', () => new YDirection(0))),
    moveDown$ = mergeS(observeKey('keydown', 'ArrowDown', () => new YDirection(1)), observeKey('keyup', 'ArrowDown', () => new YDirection(0))),
    powerUps$ = interval(5000).pipe(map(i => newPowerUp(i))), //Triggers tick to spawn new PowerUp every 5 seconds
    pauseTrigger$ = observeKey('keydown', 'Escape', () => false) //Toggles a boolean event whenever button or escape key is pressed
      .pipe(
        merge(fromEvent(document.querySelector('#Escape'), 'click').pipe(map(() => false))),
        startWith(true),
        scan(acc => !acc)
      ),
    startOnTrigger$ = interval(10) //main game stream
      .pipe(
        map(elapsed => new Tick(elapsed)),
        merge(moveUp$, moveDown$, getMousePos$, powerUps$),
        withLatestFrom(pauseTrigger$),
        filter(([_, pause]) => pause), //Filters event if currently on 'off' due to pauseTrigger
        map(([e, _]) => e),
        scan(reduceState, Constants.initialState),
        filter(s => s.gameState !== 'finished'), //stop updating view if game is finished
      ),
    restartTrigger$ = observeKey('keydown', 'KeyR', () => true) //Wrapper for main game function to handle restarting
      .pipe(
        merge(fromEvent(document.querySelector('#KeyR'), 'click').pipe(map(() => true))),
        startWith(true),
        switchMap(active => iif(() => active, startOnTrigger$)) //Unsubscribe from game trigger and resubscribe immediately to restart game
      ).subscribe(updateView)

  // Here thar be Monsters: The 'update' functions below are only functions within pong that produce a side effect
  const
    updateShape = (state: Body) =>{
      /*Updates a Body obj equivalent SVG object*/
      const shape = document.getElementById(state.id)
      shape.setAttribute('transform', `translate(${state.x},${state.y}) scale(${state.xScale},${state.yScale})`)
    },
    updateText = (textName: string) => (state: number) => {
      /* Updates a text object on the canvas */
      const text = document.getElementById(textName);
      text.textContent = String(state)
    },
    updatePowerUps = (powerUps: PowerUp[]) => {
      /* Redraws all current power ups */
      const powerUpsContainer = document.getElementById("powerUps")
      powerUpsContainer.innerHTML = ''
      powerUps.forEach(powerUp => {
        const rect = document.createElementNS(Constants.svg.namespaceURI, 'rect')
        attr(rect, powerUp.powerUp)
        powerUpsContainer.appendChild(rect)
      })
    },
    updatePowerUpText = (powerUps: PowerUp[]) => {
      /* Updates power up multiplier text */
      const powerUpText = document.getElementById("activePowerups"),
        effects = {
          xScale: powerUps.reduce((a, v) => a * v.powerUp.effect.xScale, 1),
          yScale: powerUps.reduce((a, v) => a * v.powerUp.effect.yScale, 1),
          speed: powerUps.reduce((a, v) => a * v.powerUp.effect.speed, 1)
        },
        speed = document.createElement('p'),
        size = document.createElement('p')
      speed.innerText = `Speed Multiplier: ${Math.round(effects.speed * 100) / 100}x`
      size.innerText = `Size Multiplier: ${Math.round(effects.xScale * 100) / 100}x`
      powerUpText.innerHTML = ''
      powerUpText.appendChild(speed)
      powerUpText.appendChild(size)
    },
    updateColourText = (c:ColourPalette) => {
      /* Updates colour palette text and colours on screen */
      document.getElementById("colourPaletteName").innerText = c.name
      Object.entries({"Ball":c.ball, "Bg":c.bg, "Player": c.player, "Computer": c.computer}).forEach(([name, colour]) => {
        document.getElementById(`colourPalette${name}Name`).innerText = colour
        document.getElementById(`colourPalette${name}`).setAttribute('style', `background-color:${colour}`)
        if(name !== "Bg"){
          Object.entries(document.getElementById(name).children).forEach(([_, o]) => o.setAttribute('style', `fill:${colour}`))
        } else {
          Constants.svg.setAttribute('style', `background-color:${colour}`)
        }
      });
    },
    updateEndGame = (finished: boolean) => {
      /* Creates end game text and adds to svg if game finished, otherwise removes text if it exists */
      const text = document.getElementById("gameOver")
      if (finished && !text) {
        const gameOverText = document.createElementNS(Constants.svg.namespaceURI, "text");
        attr(gameOverText, { x: Constants.canvasSize / 6, y: Constants.center, id: "gameOver" });
        gameOverText.textContent = "Game Over";
        Constants.svg.appendChild(gameOverText);
      } else if (!finished && text) {
        text.remove()
      }
    }

  function updateView(s: State) {
    /* Source of only side effects in pong function, calls functions responsible for side effects and performs side effects itself 
    This is kept as a function while all other updates are variables so it is able to be called earlier in the code
    Ideally this is kept lumped with the other update functions for code sectioning purposes*/
    [s.ball, s.playerPaddle, s.computerPaddle].forEach(updateShape)
    updateText("playerScore")(s.playerScore)
    updateText("computerScore")(s.computerScore)
    updatePowerUps(s.shownPowerUps)
    updatePowerUpText(s.activePowerUps)
    updateColourText(s.colourPalette)
    updateEndGame(s.gameState === 'winner') //Only checks if it equals winner and not finished to prevent constant adding of text
  }

  function newPowerUp(type:number): PowerUp {
    /* Generates new PowerUp to be placed on screen between 100,100 and 500,500 
    Similar to updateView, kept as a function so it can be called earlier, placing earlier would counteract sectioning of the code*/
    const sizeChange = type % 2 == 1,
      increase = (type % 4) < 2
    return new PowerUp({
      x: rng.nextInt(400) + 100,
      y: rng.nextInt(400) + 100,
      width: Constants.powerUpDimensions, //Dimensions kept the same as it's a square
      height: Constants.powerUpDimensions,
      ticksLeft: Constants.powerUpLife,
      effect: {
        xScale: 1 + (sizeChange ? increase ? Constants.effectStrength : -Constants.effectStrength : 0),
        yScale: 1 + (sizeChange ? increase ? Constants.effectStrength : -Constants.effectStrength : 0),
        speed: 1 + (sizeChange ? 0 : increase ? Constants.effectStrength : -Constants.effectStrength)
      },
      fill: sizeChange ? increase ? "white" : "grey" : increase ? "green" : "red",
      stroke:"black",
      affects: "ball" //By default all powerups will only affect the ball, however can be modified in future to affect other Body objects
    })
  }

  function convertPosToDir(s: Body, y: number, errorMargin:number=Constants.marginOfError): YDirection {
    /* Converts y-pos of an object to a relative y-dir for the body */
    return new YDirection(Math.abs(y - s.y + bodyYMid(s) * 2) >  errorMargin
      ? Math.sign(y - (s.y + bodyYMid(s) * 2))
      : 0)
  }

  function bodyYMid(s: Body): number {
    /* Get Y middle of Body object */
    return (s.height * s.yScale) / 2
  }

  function bodyXMid(s: Body): number {
    /* Get X middle of Body object */
    return (s.width * s.xScale) / 2
  }

  function initialStateFromId(id: Ids): Body {
    /* Match string Ids to initial states */
    return id == "ball" ? Constants.initialBallState
      : id == "playerPaddle" ? Constants.initialPlayerState
        : Constants.initialComputerState
  }

  function withinCanvas(dir: number, amount: number, objHeight: number): number {
    /* Binds an objects movement in a direction by the canvas */
    return dir + amount < 0 ? 0 : dir + amount > Constants.canvasSize - objHeight ? Constants.canvasSize - objHeight : dir + amount
  }

  function collidesWith(s1: Body): (s2: Obj) => boolean {
    /* Check if a Body collides with an Object, first parameter is Body to make use of it's X and Y scale to check collisions more thoroughly */
    return s2 => s1.x < (s2.x + s2.width) && s1.y < (s2.y + s2.height)
      && (s1.x + bodyXMid(s1) * 2) >= s2.x && (s1.y + bodyYMid(s1) * 2) >= s2.y
  }
  
}

function showKeys() {
  /* Handles highlighting of keys used for controls */
  function showKey(k: Key) {
    /* Generates observable to add or remove the highlight class on keyup and keydown, modified from asteroids example code */
    const arrowKey = document.getElementById(k),
      o = (e: Event) => fromEvent<KeyboardEvent>(document, e).pipe(
        filter(({ code }) => code === k),
      )
    o('keydown').subscribe(_ => arrowKey.classList.add("highlight"))
    o('keyup').subscribe(_ => arrowKey.classList.remove("highlight"))
  }
  showKey('ArrowUp')
  showKey('ArrowDown')
  showKey('KeyR') //Chosen not to merge with button press as additional work required to generate new pattern doesn't justify how long highlight would be visible

  //Escape has different function as a toggle
  const escapeKey = document.getElementById("Escape")
  fromEvent<KeyboardEvent>(document, 'keydown').pipe(
    filter(({ code }) => code === 'Escape'),
    filter(({ repeat }) => !repeat),
    merge(fromEvent(document.querySelector('#Escape'), 'click')) //merged with button so highlight will appear on button press
  ).subscribe(_ => escapeKey.classList.contains("highlight") ? escapeKey.classList.remove("highlight") : escapeKey.classList.add("highlight"))
}


// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = () => {
    pong();
    showKeys();
  }
