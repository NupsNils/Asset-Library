// Läuft in einem versteckten BrowserWindow: rendert 3D-Dateien zu einem PNG-Thumbnail.
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

interface ThumbJob {
  id: number
  url: string
  size: number
}
interface ThumbBridge {
  ready(): void
  onJob(cb: (job: ThumbJob) => void): void
  sendResult(id: number, dataUrl: string | null, error?: string): void
}
declare global {
  interface Window {
    thumbBridge: ThumbBridge
  }
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setClearColor(0x000000, 0)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1e6)

// 3-Punkt-Licht + Hemisphäre – neutraler "Clay"-Look
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2))
const key = new THREE.DirectionalLight(0xffffff, 2.2)
key.position.set(2, 3, 2)
scene.add(key)
const fill = new THREE.DirectionalLight(0xffffff, 0.8)
fill.position.set(-3, 1, -1)
scene.add(fill)
const rim = new THREE.DirectionalLight(0xffffff, 0.6)
rim.position.set(0, 2, -3)
scene.add(rim)

const clayMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, roughness: 0.55, metalness: 0.05 })

async function load(url: string): Promise<THREE.Object3D> {
  const ext = url.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'fbx': {
      const obj = await new FBXLoader().loadAsync(url)
      applyClay(obj)
      return obj
    }
    case 'obj': {
      const obj = await new OBJLoader().loadAsync(url)
      applyClay(obj)
      return obj
    }
    case 'glb':
    case 'gltf': {
      const gltf = await new GLTFLoader().loadAsync(url)
      return gltf.scene
    }
    default:
      throw new Error(`Unsupported format: ${ext}`)
  }
}

/** FBX/OBJ-Materialien referenzieren meist externe Texturen → einheitliches Clay-Material. */
function applyClay(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.material = clayMaterial
      if (!mesh.geometry.attributes['normal']) mesh.geometry.computeVertexNormals()
    }
  })
}

function frame(obj: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty()) throw new Error('Empty model')
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() / 2, 1e-6)
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
  const dir = new THREE.Vector3(1, 0.55, 1.25).normalize()
  camera.position.copy(center).addScaledVector(dir, dist * 1.05)
  camera.near = dist / 100
  camera.far = dist * 100
  camera.updateProjectionMatrix()
  camera.lookAt(center)
  // Lichter relativ zur Modellgröße positionieren
  key.position.copy(center).add(new THREE.Vector3(2, 3, 2).multiplyScalar(radius))
  fill.position.copy(center).add(new THREE.Vector3(-3, 1, -1).multiplyScalar(radius))
  rim.position.copy(center).add(new THREE.Vector3(0, 2, -3).multiplyScalar(radius))
  for (const l of [key, fill, rim]) l.target.position.copy(center)
}

function dispose(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (m === clayMaterial) continue
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
  })
}

async function renderJob(job: ThumbJob): Promise<string> {
  const obj = await load(job.url)
  try {
    scene.add(obj)
    frame(obj)
    renderer.setSize(job.size, job.size, false)
    renderer.render(scene, camera)
    return canvas.toDataURL('image/png')
  } finally {
    scene.remove(obj)
    dispose(obj)
  }
}

window.thumbBridge.onJob((job) => {
  renderJob(job)
    .then((dataUrl) => window.thumbBridge.sendResult(job.id, dataUrl))
    .catch((err: unknown) =>
      window.thumbBridge.sendResult(job.id, null, err instanceof Error ? err.message : String(err))
    )
})
window.thumbBridge.ready()
