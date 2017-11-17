import * as _ from 'lodash'
import * as React from 'react'
import './App.css'

const NUM_WIRES = 6
// How frequently we poll the server for changes
const POLL_FREQUENCY = 1000 // ms
const POLL_TIMEOUT = 1500 // ms

const SERVER_URL = (() =>
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

type ServerState = {
  weaponLevel: WeaponLevel
  isGameWon: boolean
  isGameLost: boolean
  isGameStarted: boolean
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
      setTimeout(() => reject(new Error('timeout')), ms)
      promise.then(resolve, reject)
    })
  }
  return timeout(POLL_TIMEOUT, fetch(`${SERVER_URL}/${path}`))
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
    enabledMillis: 3000,
  },
  {
    level: 2,
    wires: [WireColor.red, WireColor.orange, WireColor.blue],
    disabledMillis: 3000,
    enabledMillis: 3000,
  },
  {
    level: 3,
    wires: [WireColor.red, WireColor.orange, WireColor.yellow, WireColor.green, WireColor.blue, WireColor.purple],
    disabledMillis: 3000,
    enabledMillis: 3000,
  },
]

type AppState = {
  serverState: ServerState
  ports: Array<Port>
  isLoading: boolean
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
        },
      }
  }

  componentDidMount() {
    this.onPollTimer()
    setInterval(this.onPollTimer.bind(this), POLL_FREQUENCY)
  }

  onPollTimer() {
    fetchServer('state')
    .then(serverState => this.setState({serverState, isLoading: false}))
  }

  overheatPorts(portsToOverheat: Array<Port>, duration: number) {
    const ports = this.state.ports.map(port => {
      if (port.status.kind !== 'unplugged' && portsToOverheat.includes(port)) {
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
    const wireIsPluggedIn = (w: WireColor): boolean => (
      this.state.ports.some(port => {
        if (port.status.kind === 'unused') {
          return port.status.wire === w
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
      }
      return port
    })

    if (this.state.serverState.weaponLevel !== weapon.level) {
      this.setWeaponLevel(weapon.level)
      if (weapon.level > 0) {
        setTimeout(() => this.overheatPorts(portsUsedInWeapon, weapon.disabledMillis), weapon.enabledMillis)
      }
    }

    this.setState({ports})
  }

  plugWireIntoPort(wire: WireColor | null, port: Port) {
    const ports = this.state.ports.map(p => {
      if (p.id === port.id) {
        p.status = wire === null ? {kind: 'unplugged'} : {kind: 'unused', wire}
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
        <div className="Bays">
          {renderBay(this.state.ports.slice(0, NUM_WIRES / 2))}
          {renderBay(this.state.ports.slice(NUM_WIRES / 2, NUM_WIRES))}
        </div>
      </div>
    )
  }

}

export default App
