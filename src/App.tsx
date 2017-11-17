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

enum EnergyType {
  red = 0,
  orange,
  yellow,
  green,
  blue,
  purple
}

module EnergyType {

  export function getValues() {
    let names: string[] = []
    for (const name in EnergyType) {
      if (typeof EnergyType[name] === 'number') {
        names.push(name)
      }
    }
    return names
  }

}

type WeaponId = number

type SequenceToken = WireColor | '*' | 'x'

type Weapon = {
  id: WeaponId
  sequence: Array<SequenceToken>
  enabledMillis: number
  disabledMillis: number
}

interface Used {
  kind: 'used'
  wire: number
}

interface Unused {
  kind: 'unused'
  wire: number
}

interface Unplugged {
  kind: 'unplugged'
}

interface Disabled {
  kind: 'disabled'
  wire: number
  expiration: number
}

type Port = {
  id: number
  status: Used | Unused | Unplugged | Disabled
}

type ServerState = {
  weaponId: WeaponId | null
  energyId: EnergyType | null
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

function portUsedInWeapon(port: Port, weapon: Weapon, includeWildcard = false): boolean {
  if (includeWildcard && weapon.sequence[port.id] === '*') {
    return true
  }
  if (port.status.kind === 'unplugged') {
    return false
  }
  if (port.status.kind === 'disabled') {
    return false
  }
  return weapon.sequence[port.id] === port.status.wire
}

function activeWeapon(weapons: Array<Weapon>, ports: Array<Port>): Weapon | null {
  const weaponMatchesPorts = (weapon: Weapon): boolean => (
    ports.every(port => portUsedInWeapon(port, weapon, true))
  )
  return weapons.find(weaponMatchesPorts) || null
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
    id: 0,
    sequence: [0, 0, '*', '*', '*', '*'],
    disabledMillis: 3000,
    enabledMillis: 3000,
  },
  {
    id: 1,
    sequence: [3, '*', 3, '*', 4, '*'],
    disabledMillis: 3000,
    enabledMillis: 3000,
  },
  {
    id: 2,
    sequence: [1, '*', 1, 1, '*', 1],
    disabledMillis: 3000,
    enabledMillis: 3000,
  },
]

type AppState = {
  serverState: ServerState
  ports: Array<Port>
  isLoading: boolean
  weapon: Weapon | null
}

class App extends React.Component<{}, AppState> {

  constructor(props: {}) {
      super(props)
      this.state = {
        ports: _.range(NUM_WIRES).map(i => ({id: i, status: {kind: 'unplugged'}} as Port)),
        weapon: null,
        isLoading: true,
        serverState: {
          weaponId: null,
          energyId: null,
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

  weaponEnabledExpired(weapon: Weapon) {
    console.log(`weapon with id ${weapon.id} expired`)
    const ports = this.state.ports.map(port => {
      if (portUsedInWeapon(port, weapon) && port.status.kind !== 'unplugged') {
        port.status = {
          kind: 'disabled',
          expiration: Date.now() + weapon.disabledMillis,
          wire: port.status.wire
        }
      }
      return port
    })
    this.setState({ports})
  }

  plugWireIntoPort(wire: WireColor | null, port: Port) {
    // connect wire to port
    let ports = this.state.ports.map(p => {
      if (p.id === port.id) {
        p.status = wire === null ? {kind: 'unplugged'} : {kind: 'unused', wire}
      }
      return p
    })

    // Determine new weapon (if any)
    const weapon = activeWeapon(allWeapons, ports)
    const weaponId = weapon ? weapon.id : null

    // Include other ports in active weapon if needed
    ports = ports.map((p: Port, i: number) => {
      if (weapon && portUsedInWeapon(p, weapon)) {
        p.status.kind = 'used'
      }
      return p
    })

    if (this.state.serverState.weaponId !== weaponId) {
      if (weaponId === null) {
        this.disableWeapon()
      } else {
        this.enableWeapon(weaponId)
        setTimeout(() => this.weaponEnabledExpired(weapon!), weapon!.enabledMillis)
      }
    }

    this.setState({ports, weapon})
  }

  setEnergy(id: EnergyType) {
    fetchServer(`energy/${id}`)
    .then(state => this.setState(state))
  }

  enableWeapon(id: WeaponId) {
    fetchServer(`weapon/enable/${id}`)
    .then(state => this.setState(state))
  }

  disableWeapon() {
    fetchServer(`weapon/disable`)
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
              className={`Port Wire-${port.status.kind === 'unplugged' ? 'none' : colorName(port.status.wire)}`}
              onClick={() => this.cycleWire(port)}
            >
              <div className={`Port-status Port-status-${port.status.kind}`} />
            </div>
          ))}
        </div>
      )
    }

    // const currentSequence = this.state.ports.map(port => port.status.kind === 'unplugged' ? '' : port.status.wire)

    const energyId = this.state.serverState.energyId
    return (
      <div className="App">
        <div className="Bays">
          {renderBay(this.state.ports.slice(0, NUM_WIRES / 2))}
          {renderBay(this.state.ports.slice(NUM_WIRES / 2, NUM_WIRES))}
          <div className="Energy">
            <div className="Energy-label">Energy </div>
            <select
              defaultValue={energyId === null ? '' : EnergyType[energyId]}
              onChange={e => e.target.value !== '' && this.setEnergy(EnergyType[e.target.value] as EnergyType)}
            >
              <option value="" key=""/>
              {EnergyType.getValues().map((name) => (
                <option value={name} key={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

}

export default App
