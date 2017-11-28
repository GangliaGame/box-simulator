import * as _ from 'lodash'
import * as React from 'react'
import * as io from 'socket.io-client'
import * as Spinner from 'react-spinkit'
import { Bay } from './bay'
import { Color, Wire } from './types'
import './app.css'

const NUM_WIRES = 3
const BASE_URL = (() =>
  window.location.search.includes('local') ?
  'http://localhost:9000' :
  'https://ganglia-server.herokuapp.com'
)()

type AppState = {
  wires: Array<Wire>
  isLoading: boolean
  overHeatTimer: number | null
  shieldTimer: number | null
  socket: SocketIOClient.Socket
}

class App extends React.Component<{}, AppState> {

  constructor(props: {}) {
    super(props)
    this.state = {
      wires: _.range(NUM_WIRES).map(i => ({color: i, inUse: false} as Wire)),
      isLoading: true,
      shieldTimer: null,
      overHeatTimer: null,
      socket: io(BASE_URL),
    }
    this.state.socket.on('connect', () => this.setState({isLoading: false}))
    this.state.socket.on('disconnect', () => this.setState({isLoading: true}))
  }

  setWeaponColors(colors: Array<Color>) {
    this.state.socket.emit('weapon', {colors})
  }

  fireWeapon() {
    this.state.socket.emit('fire')
  }

  setMovement(direction: 'up' | 'down' | 'stop') {
    this.state.socket.emit('move', {direction})
  }

  setShieldColors(colors: Array<Color>) {
    this.state.socket.emit('shield', {colors})
  }

  setPropulsionMode(mode: 'off' | 'slow' | 'fast') {
    this.state.socket.emit('propulsion', {mode})
  }

  setRegenLevel(level: number) {
    this.state.socket.emit('regen', {level})
  }

  onWireAdded(wire: Wire) {
    const wires = this.state.wires.map(w => {
      if (w.color === wire.color) {
        w.inUse = true
      }
      return w
    })
    this.setState({wires})
  }

  onWireRemoved(wire: Wire) {
    const wires = this.state.wires.map(w => {
      if (w.color === wire.color) {
        w.inUse = false
      }
      return w
    })
    this.setState({wires})
  }

  onNewWeaponsConfiguration(wires: Array<Wire | null>) {
    const weaponColors = wires
      .filter(wire => wire !== null)
      .map(wire => wire!.color)
      .sort((a, b) => Number(a > b))
    this.setWeaponColors(weaponColors)
  }

  onNewShieldsConfiguration(wires: Array<Wire | null>) {
    const shieldColors = wires
      .filter(wire => wire !== null)
      .map(wire => wire!.color)
      .sort((a, b) => Number(a > b))
    this.setShieldColors(shieldColors)
  }

  onNewPropulsionConfiguration(wires: Array<Wire | null>) {
    const pluggedInWires = wires.filter(wire => wire !== null).length
    if (pluggedInWires === 1) this.setPropulsionMode('slow')
    else if (pluggedInWires === 2) this.setPropulsionMode('fast')
    else this.setPropulsionMode('off')
  }

  onNewRegenConfiguration(wires: Array<Wire | null>) {
    const regenLevel = wires.filter(wire => wire !== null).length
    return this.setRegenLevel(regenLevel)
  }

  onNewCommunicationConfiguration(wires: Array<Wire | null>) {
    const isEnabled = wires[0] !== null
    if (isEnabled) alert('communications enabled')
    else alert('communications disabled')
  }

  render() {
    if (this.state.isLoading) {
      return (
        <div className="App">
          <Spinner name="wandering-cubes" color="white"/>
        </div>
      )
    }

    return (
      <div className="App">
        <div className="Bays">
          <Bay
            name="Weapons"
            numPorts={3}
            wires={this.state.wires}
            onNewConfiguration={this.onNewWeaponsConfiguration.bind(this)}
            onWireAdded={this.onWireAdded.bind(this)}
            onWireRemoved={this.onWireRemoved.bind(this)}
          >
            <div className="FireButton" onClick={this.fireWeapon.bind(this)}>
              FIRE
            </div>
          </Bay>
            <Bay
            name="Shields"
            numPorts={3}
            wires={this.state.wires}
            onNewConfiguration={this.onNewShieldsConfiguration.bind(this)}
            onWireAdded={this.onWireAdded.bind(this)}
            onWireRemoved={this.onWireRemoved.bind(this)}
          />
          <Bay
            name="Propulsion"
            numPorts={2}
            wires={this.state.wires}
            onNewConfiguration={this.onNewPropulsionConfiguration.bind(this)}
            onWireAdded={this.onWireAdded.bind(this)}
            onWireRemoved={this.onWireRemoved.bind(this)}
          >
            <div className="Propulsion-controls">
              <div className="Move"
              onTouchStart={() => this.setMovement('up')}
              onTouchEnd={() => this.setMovement('stop')}
              onMouseDown={() => this.setMovement('up')}
              onMouseUp={() => this.setMovement('stop')}>⬆</div>
              <div className="Move"
              onTouchStart={() => this.setMovement('down')}
              onTouchEnd={() => this.setMovement('stop')}
              onMouseDown={() => this.setMovement('down')}
              onMouseUp={() => this.setMovement('stop')}>⬇</div>
            </div>
          </Bay>
          <Bay
            name="Repairs"
            numPorts={3}
            wires={this.state.wires}
            onNewConfiguration={this.onNewRegenConfiguration.bind(this)}
            onWireAdded={this.onWireAdded.bind(this)}
            onWireRemoved={this.onWireRemoved.bind(this)}
          />
          <Bay
            name="Communications"
            numPorts={1}
            wires={this.state.wires}
            onNewConfiguration={this.onNewCommunicationConfiguration.bind(this)}
            onWireAdded={this.onWireAdded.bind(this)}
            onWireRemoved={this.onWireRemoved.bind(this)}
          />
        </div>
      </div>
    )
  }

}

export default App
