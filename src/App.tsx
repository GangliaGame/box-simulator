import * as _ from 'lodash'
import * as React from 'react'
import * as io from 'socket.io-client'
import './App.css'

const NUM_WIRES = 6
// How frequently we poll the server for changes
const POLL_FREQUENCY = 1000 // ms
const POLL_TIMEOUT = 1500 // ms

const BASE_URL = (() =>
  window.location.search.includes('local') ?
  'http://localhost:9000' :
  'https://ganglia-server.herokuapp.com'
)()

enum WireColor {
  red = 0,
  orange = 1,
  yellow = 2,
  green = 3,
  blue = 4,
  purple = 5
}

type WeaponLevel = 0 | 1 | 2 | 3

type Weapon = {
  level: WeaponLevel
  wires: Array<WireColor>
  enabledMillis: number
  disabledMillis: number
}

interface Used {
  kind: 'used'
  wire: WireColor
}

interface Unused {
  kind: 'unused'
  wire: WireColor
}

interface Unplugged {
  kind: 'unplugged'
}

interface Disabled {
  kind: 'disabled'
  wire: WireColor
  expiration: number
}

type Port = {
  id: number
  status: Used | Unused | Unplugged | Disabled
}

type ShieldStatus = 'ready' | 'active' | 'disabled'

type ServerState = {
  weaponLevel: WeaponLevel
  isGameWon: boolean
  isGameLost: boolean
  isGameStarted: boolean
  isShieldActive: boolean
}

function colorName(color: WireColor) {
  switch (color) {
    case WireColor.red: return 'red'
    case WireColor.orange: return 'orange'
    case WireColor.yellow: return 'yellow'
    case WireColor.green: return 'green'
    case WireColor.blue: return 'blue'
    case WireColor.purple: return 'purple'
    default: return ''
  }
}

function getPortsUsedInWeapon(ports: Array<Port>, weapon: Weapon): Array<Port> {
  let usedColors: Array<WireColor> = []
  return ports.filter((p: Port, i: number) => {
    if (p.status.kind === 'used' || p.status.kind === 'unused') {
      if (weapon.wires.includes(p.status.wire) && !usedColors.includes(p.status.wire)) {
        usedColors.push(p.status.wire)
        return true
      }
    }
    return false
  })
}

function fetchServer(path: string) {
  function timeout(ms: number, promise: Promise<Response>) {
    return new Promise((resolve, reject) => {
      window.setTimeout(() => reject(new Error('timeout')), ms)
      promise.then(resolve, reject)
    })
  }
  return timeout(POLL_TIMEOUT, fetch(`${BASE_URL}/${path}`))
  .then((response: Response) => response.json())
  .catch((error: Object) => {
    console.error(error)
  })
}

const allWeapons: Array<Weapon> = [
  {
    level: 0,
    wires: [],
    disabledMillis: 0,
    enabledMillis: 0,
  },
  {
    level: 1,
    wires: [WireColor.red, WireColor.blue],
    disabledMillis: 3000,
    enabledMillis: 5000,
  },
  {
    level: 2,
    wires: [WireColor.red, WireColor.orange, WireColor.blue],
    disabledMillis: 3000,
    enabledMillis: 7000,
  },
  {
    level: 3,
    wires: [WireColor.red, WireColor.orange, WireColor.yellow, WireColor.green, WireColor.blue, WireColor.purple],
    disabledMillis: 3000,
    enabledMillis: 5000,
  },
]

type AppState = {
  serverState: ServerState
  ports: Array<Port>
  isLoading: boolean
  overHeatTimer: number | null
  moveTimer: number | null
  shieldTimer: number | null
  shieldStatus: ShieldStatus
  socket: SocketIOClient.Socket
}

class App extends React.Component<{}, AppState> {

  constructor(props: {}) {
    super(props)
    this.state = {
      ports: _.range(NUM_WIRES).map(i => ({id: i, status: {kind: 'unplugged'}} as Port)),
      isLoading: true,
      serverState: {
        weaponLevel: 0,
        isGameWon: false,
        isGameLost: false,
        isGameStarted: false,
        isShieldActive: false,
      },
      moveTimer: null,
      shieldStatus: 'ready',
      shieldTimer: null,
      overHeatTimer: null,
      socket: io(BASE_URL),
    }
  }

  componentDidMount() {
    this.onPollTimer()
    window.setInterval(this.onPollTimer.bind(this), POLL_FREQUENCY)
  }

  onPollTimer() {
    fetchServer('state')
    .then(serverState => this.setState({serverState, isLoading: false}))
  }

  overheatPorts(portsToOverheat: Array<Port>, duration: number) {
    const ports = this.state.ports.map(port => {
      if (port.status.kind === 'used') {
        port.status = {
          kind: 'disabled',
          expiration: Date.now() + duration,
          wire: port.status.wire
        }
      }
      return port
    })
    this.setState({ports}, () => this.updatePorts())
  }

  updatePorts() {
    // Does ANY port have a wire of this color plugged in?
    const wireIsPluggedIn = (wire: WireColor): boolean => (
      this.state.ports.some(port => {
        if (port.status.kind === 'unused') {
          return port.status.wire === wire
        }
        return false
      })
    )

    // Get determine the highest active weapon level
    const weapon = _.maxBy(
      allWeapons.filter(weapon => weapon.wires.every(wireIsPluggedIn)),
      weapon => weapon.level
    )!

    const portsUsedInWeapon = getPortsUsedInWeapon(this.state.ports, weapon)

    // Mark ports used in weapon
    const ports = this.state.ports.map(port => {
      if (portsUsedInWeapon.includes(port)) {
        port.status.kind = 'used'
      } else if (port.status.kind === 'used') {
        port.status = { kind: 'unused', wire: port.status.wire}
      }
      return port
    })

    let overHeatTimer = null

    if (this.state.serverState.weaponLevel !== weapon.level) {
      this.setWeaponLevel(weapon.level)
      if (weapon.level > 0) {
        overHeatTimer = window.setTimeout(() => this.overheatPorts(portsUsedInWeapon, weapon.disabledMillis), weapon.enabledMillis)
      }
    }

    this.setState({ports, overHeatTimer})
  }

  plugWireIntoPort(wire: WireColor | null, port: Port) {
    const ports = this.state.ports.map(p => {
      if (p.id === port.id) {
        if (wire === null) {
          p.status = { kind: 'unplugged' }
        } else {
          p.status = { kind: 'unused', wire }
        }
      }
      return p
    })

    this.setState({ports}, () => this.updatePorts())
  }

  setWeaponLevel(level: WeaponLevel) {
    fetchServer(`weapon/set/${level}`)
    .then(state => this.setState(state))
  }

  cycleWire(port: Port) {
    if (port.status.kind === 'unplugged') {
      this.plugWireIntoPort(0, port)
    } else if (port.status.wire + 1 === NUM_WIRES) {
      this.plugWireIntoPort(null, port)
    } else {
      this.plugWireIntoPort(port.status.wire + 1, port)
    }
  }

  move(direction: 'up' | 'down') {
    this.state.socket.emit(`move:${direction}`)
  }

  startMoving(direction: 'up' | 'down') {
    this.setState({moveTimer: window.setInterval(() => this.move(direction), 10)})
  }

  stopMoving() {
    if (this.state.moveTimer) {
      window.clearInterval(this.state.moveTimer)
      this.setState({moveTimer: null})
    }
  }

  turnShield(condition: 'on' | 'off') {
    fetchServer(`shield/${condition}`)
    .then(state => this.setState(state))
  }

  onShieldClicked() {
    const readyAfter = (seconds: number) => {
      const shieldTimer = window.setTimeout(
        () => this.setState({shieldStatus: 'ready'}),
        seconds * 1000
      )
      this.setState({shieldTimer})
    }
    if (this.state.shieldStatus === 'ready') {
      this.turnShield('on')
      const shieldTimer = window.setTimeout(
        () => {
          this.setState({shieldStatus: 'disabled'})
          this.turnShield('off')
          readyAfter(10)
        },
        4
      )
      this.setState({shieldTimer, shieldStatus: 'active'})
    }
    else if (this.state.shieldStatus === 'active') {
      this.turnShield('off')
      if (this.state.shieldTimer) {
        window.clearTimeout(this.state.shieldTimer)
        this.setState({shieldStatus: 'disabled'})
        readyAfter(5)
      }
    }
  }

  render() {
    if (this.state.isLoading) {
      return 'loading'
    }

    const renderBay = (ports: Array<Port>) => {
      return (
        <div className="Bay">
          {ports.map((port) => (
            <div
              key={port.id}
              className={`Port Wire-${port.status.kind === 'unplugged' ? 'none' : colorName(port.status.wire)}`}
              onClick={() => this.cycleWire(port)}
            >
              <div className={`Port-status Port-status-${port.status.kind}`} />
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="App">
        <div className="Controls">
          <div className="LeftControls">
            <div className="Propulsion">
              <div className="Propulsion-control"
                onTouchStart={() => this.startMoving('up')}
                onTouchEnd={() => this.stopMoving()}
                onMouseDown={() => this.startMoving('up')}
                onMouseUp={() => this.stopMoving()}>⬆️</div>
              <div className="Propulsion-control"
                onTouchStart={() => this.startMoving('down')}
                onTouchEnd={() => this.stopMoving()}
                onMouseDown={() => this.startMoving('down')}
                onMouseUp={() => this.stopMoving()}>⬇️</div>
            </div>
            <div
              className={`Shield Shield-status-${this.state.shieldStatus}`}
              onClick={() => this.onShieldClicked()}>S</div>
          </div>
          <div className="Bays">
            {renderBay(this.state.ports.slice(0, NUM_WIRES / 2))}
            {renderBay(this.state.ports.slice(NUM_WIRES / 2, NUM_WIRES))}
          </div>
        </div>
      </div>
    )
  }

}

export default App
