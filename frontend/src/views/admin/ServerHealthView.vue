<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  useServerHealth,
  useHealthHistory,
  useUptime,
  formatUptime,
  formatBytes,
  type ServerHealthMetrics,
} from '@/composables/useServerHealth'
import {
  useAdminIncidents,
  type CreateIncidentData,
  type UpdateIncidentData,
} from '@/composables/useIncidents'
import { useWebSocket } from '@/composables/useWebSocket'
import { useToast } from '@/composables/useToast'
import { useCurrentUptime } from '@/composables/useServerReboot'
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue'
import { formatDistanceToNow } from 'date-fns'
import type { ChartData, ChartOptions } from 'chart.js'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/themes/dark.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import LineChart from '@/components/charts/LineChart.vue'
import ServerUptimeCard from '@/components/admin/ServerUptimeCard.vue'
import RebootHistoryTable from '@/components/admin/RebootHistoryTable.vue'
import UptimeStatsCards from '@/components/admin/UptimeStatsCards.vue'
import WebTerminal from '@/components/admin/WebTerminal.vue'
import { useAuth } from '@/composables/useAuth'
import {
  Activity,
  Database,
  Users,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Info,
  Copy,
  Calendar,
  Clock,
  Terminal,
} from 'lucide-vue-next'

// Toast notifications
const { success } = useToast()

// Auth for permission check
const { isOverlord, hasPermission } = useAuth()

// Check terminal access permission (Overlords always have access)
const hasTerminalAccess = computed(() => isOverlord.value || hasPermission('terminal_access'))

// Tab management
const route = useRoute()
const activeTab = ref((route.query.tab as string) || 'overview')

// Real-time health data
const { health, status, isLoading } = useServerHealth(true)
const { uptime, isLoading: isLoadingUptime } = useUptime(90)
const { uptime: serverUptime } = useCurrentUptime()

// Historical data
const selectedPeriod = ref<number>(24)
const { history, isLoading: isLoadingHistory } = useHealthHistory(selectedPeriod)

// WebSocket for real-time updates
const ws = useWebSocket()
const liveHealth = ref<ServerHealthMetrics | undefined>(health.value)

// Store callback references for cleanup
const healthUpdateCallback = (data: any) => {
  if (data.health) {
    liveHealth.value = data.health
  }
}
const crashAlertCallback = () => {
  refetchAdminIncidents()
}

// Use live health if available, fallback to polled health
const currentHealth = computed(() => liveHealth.value || health.value)

// Status badge styling
const statusColor = computed(() => {
  const s = status.value?.status
  if (s === 'operational') return 'bg-green-500/20 text-green-400 border-green-500/50'
  if (s === 'degraded') return 'bg-orange-500/20 text-orange-400 border-orange-500/50'
  if (s === 'offline') return 'bg-red-500/20 text-red-500 border-red-500/50'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
})

const statusIcon = computed(() => {
  const s = status.value?.status
  if (s === 'operational') return CheckCircle2
  if (s === 'degraded') return AlertTriangle
  return XCircle
})

// Period selector
function setPeriod(hours: number) {
  selectedPeriod.value = hours
}

// Format chart labels based on selected period
function formatChartLabel(dateString: string, periodHours: number): string {
  const date = new Date(dateString)

  // For periods <= 24 hours, show time (HH:MM)
  if (periodHours <= 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // For periods > 24 hours and <= 7 days, show date and time (MM/DD HH:MM)
  if (periodHours <= 168) {
    return (
      date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  // For periods > 7 days, show date only (MM/DD)
  return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
}

// Chart data
const cpuChartData = computed<ChartData<'line'>>(() => {
  const data = history.value || []
  return {
    labels: data.map((item) => formatChartLabel(item.recorded_at, selectedPeriod.value)),
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: data.map((item) => item.mud_cpu_percent),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const memoryChartData = computed<ChartData<'line'>>(() => {
  const data = history.value || []
  return {
    labels: data.map((item) => formatChartLabel(item.recorded_at, selectedPeriod.value)),
    datasets: [
      {
        label: 'Memory Usage (MB)',
        data: data.map((item) => item.mud_memory_mb),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const playersChartData = computed<ChartData<'line'>>(() => {
  const data = history.value || []
  return {
    labels: data.map((item) => formatChartLabel(item.recorded_at, selectedPeriod.value)),
    datasets: [
      {
        label: 'Online Players',
        data: data.map((item) => item.online_players),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const dbChartData = computed<ChartData<'line'>>(() => {
  const data = history.value || []
  return {
    labels: data.map((item) => formatChartLabel(item.recorded_at, selectedPeriod.value)),
    datasets: [
      {
        label: 'DB Query Time (ms)',
        data: data.map((item) => item.db_query_time_ms),
        borderColor: 'rgb(249, 115, 22)',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(255, 255, 255, 0.05)',
      },
      ticks: {
        color: 'rgba(255, 255, 255, 0.7)',
        maxRotation: 0,
        autoSkipPadding: 20,
      },
    },
    y: {
      grid: {
        color: 'rgba(255, 255, 255, 0.05)',
      },
      ticks: {
        color: 'rgba(255, 255, 255, 0.7)',
      },
    },
  },
}

const formatCrashUptime = (seconds: number | null) => {
  if (!seconds) return 'N/A'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function initializeEditDatePicker() {
  if (!editEndedAtInput.value) {
    return
  }

  // Destroy existing picker if any
  if (editEndedAtPicker && typeof editEndedAtPicker.destroy === 'function') {
    editEndedAtPicker.destroy()
    editEndedAtPicker = null
  }

  try {
    // Use ended_at if exists, otherwise default to now
    const defaultDate = editForm.value?.ended_at || new Date()

    editEndedAtPicker = flatpickr(
      editEndedAtInput.value as HTMLElement,
      {
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        time_24hr: true,
        appendTo: document.body,
        static: true,
        defaultDate: defaultDate,
        onChange: (_selectedDates: any, dateStr: string) => {
          if (editForm.value) {
            editForm.value.ended_at = dateStr
          }
        },
      } as any,
    )
  } catch {
    // Silent error handling
  }
}

function initializeDateRangePicker() {
  if (!dateRangeInput.value) {
    return
  }

  // Destroy existing picker if any
  if (dateRangePicker && typeof dateRangePicker.destroy === 'function') {
    dateRangePicker.destroy()
    dateRangePicker = null
  }

  try {
    dateRangePicker = flatpickr(
      dateRangeInput.value as HTMLElement,
      {
        mode: 'range',
        dateFormat: 'Y-m-d',
        appendTo: document.body,
        static: true,
        onChange: (_selectedDates: Date[], _dateStr: string, _instance: any) => {
          if (_selectedDates.length === 2 && _selectedDates[0] && _selectedDates[1]) {
            // Format dates as YYYY-MM-DD
            const from = _selectedDates[0].toISOString().split('T')[0]
            const to = _selectedDates[1].toISOString().split('T')[0]
            incidentDateFilter.value = { from, to }
            currentIncidentPage.value = 1 // Reset to page 1 when filtering
          }
        },
      } as any,
    )
  } catch (err) {
    console.error('Error initializing flatpickr:', err)
  }
}

// Copy backtrace to clipboard
async function copyBacktraceToClipboard() {
  if (!editForm.value?.backtrace) return

  try {
    await navigator.clipboard.writeText(editForm.value.backtrace)
    success('Backtrace copied to clipboard', 'Success', 3000)
  } catch (err) {
    console.error('Failed to copy backtrace:', err)
  }
}

// Clear date range filter
function clearDateFilter() {
  incidentDateFilter.value = {}
  currentIncidentPage.value = 1
  if (dateRangePicker && typeof dateRangePicker.clear === 'function') {
    dateRangePicker.clear()
  }
}

// Incidents tab
const currentIncidentPage = ref(1)
const incidentPageSize = ref(10) // Default 10 items per page
const incidentDateFilter = ref<{ from?: string; to?: string }>({})
const {
  incidents,
  pagination: incidentPagination,
  isLoading: isLoadingIncidentsList,
  createIncident,
  updateIncident,
  deleteIncident,
  isCreating,
  isUpdating,
  isDeleting,
  refetch: refetchAdminIncidents,
} = useAdminIncidents(currentIncidentPage, incidentPageSize, incidentDateFilter)

function changeIncidentPageSize(newSize: number) {
  incidentPageSize.value = newSize
  currentIncidentPage.value = 1 // Reset to page 1 when changing size
}

onMounted(() => {
  // WebSocket handlers - use stored references for proper cleanup
  ws.onHealthUpdate(healthUpdateCallback)
  ws.onCrashAlert(crashAlertCallback)

  // Initialize date range picker if we're on the incidents tab
  if (activeTab.value === 'incidents') {
    setTimeout(() => {
      initializeDateRangePicker()
    }, 100)
  }
})

onBeforeUnmount(() => {
  // Clean up WebSocket callbacks to prevent memory leaks
  ws.offHealthUpdate(healthUpdateCallback)
  ws.offCrashAlert(crashAlertCallback)

  if (editEndedAtPicker && typeof editEndedAtPicker.destroy === 'function') {
    editEndedAtPicker.destroy()
    editEndedAtPicker = null
  }
  if (dateRangePicker && typeof dateRangePicker.destroy === 'function') {
    dateRangePicker.destroy()
    dateRangePicker = null
  }
})

const showCreateDialog = ref(false)
const createForm = ref<CreateIncidentData>({
  incident_type: 'crash',
  severity: 'major',
  title: '',
  description: '',
  started_at: new Date().toISOString().slice(0, 16),
  ended_at: '',
  resolved: false,
  public_visible: false,
})

const showEditDialog = ref(false)
const editForm = ref<UpdateIncidentData | null>(null)
const editEndedAtInput = ref<HTMLInputElement | null>(null)
let editEndedAtPicker: flatpickr.Instance | null = null

// Date range filter
const dateRangeInput = ref<HTMLInputElement | null>(null)
let dateRangePicker: flatpickr.Instance | null = null

// Cleanup flatpickr when dialog closes
watch(showEditDialog, (newVal) => {
  if (!newVal && editEndedAtPicker && typeof editEndedAtPicker.destroy === 'function') {
    editEndedAtPicker.destroy()
    editEndedAtPicker = null
  }
})

// Initialize date range picker when Incidents tab is opened
watch(activeTab, (newTab) => {
  if (newTab === 'incidents') {
    // Use setTimeout to give the DOM time to render
    setTimeout(() => {
      initializeDateRangePicker()
    }, 100)
  }
})

const showDeleteDialog = ref(false)
const deleteId = ref<number | null>(null)

function resetCreateForm() {
  createForm.value = {
    incident_type: 'crash',
    severity: 'major',
    title: '',
    description: '',
    started_at: new Date().toISOString().slice(0, 16),
    ended_at: '',
    resolved: false,
    public_visible: false,
  }
}

function openCreateDialog() {
  resetCreateForm()
  showCreateDialog.value = true
}

function openEditDialog(incident: any) {
  editForm.value = {
    id: incident.id,
    incident_type: incident.incident_type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description || '',
    started_at: incident.started_at ? new Date(incident.started_at).toISOString().slice(0, 16) : '',
    ended_at: incident.ended_at
      ? new Date(incident.ended_at).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    resolved: !!incident.resolved,
    resolution_notes: incident.resolution_notes || '',
    public_visible: !!incident.public_visible,
    // Copy all crash forensic fields
    exit_code: incident.exit_code,
    crash_signal: incident.crash_signal,
    pid: incident.pid,
    uptime_seconds: incident.uptime_seconds,
    memory_mb: incident.memory_mb,
    cpu_percent: incident.cpu_percent,
    online_players: incident.online_players,
    crash_function: incident.crash_function,
    crash_file: incident.crash_file,
    crash_line: incident.crash_line,
    backtrace: incident.backtrace,
    wholist_snapshot: incident.wholist_snapshot,
    cmd_debug_last3: incident.cmd_debug_last3,
    status_log_last3: incident.status_log_last3,
    wizcmds_last3: incident.wizcmds_last3,
    debug_log_excerpt: incident.debug_log_excerpt,
    analyzed: incident.analyzed,
    notes: incident.notes,
  }
  showEditDialog.value = true

  // Initialize flatpickr after dialog opens
  nextTick(() => {
    initializeEditDatePicker()
  })
}

function openDeleteDialog(id: number) {
  deleteId.value = id
  showDeleteDialog.value = true
}

async function handleCreate() {
  try {
    const payload = {
      ...createForm.value,
      ended_at: createForm.value.ended_at || undefined,
    }
    await createIncident(payload)
    showCreateDialog.value = false
    resetCreateForm()
  } catch (error) {
    console.error('Failed to create incident:', error)
  }
}

async function handleUpdate() {
  if (!editForm.value) return

  try {
    const payload = {
      ...editForm.value,
      ended_at: editForm.value.ended_at || undefined,
      description: editForm.value.description || undefined,
      resolution_notes: editForm.value.resolution_notes || undefined,
    }
    await updateIncident(payload)
    showEditDialog.value = false
    editForm.value = null
  } catch (error) {
    console.error('Failed to update incident:', error)
  }
}

async function handleDelete() {
  if (!deleteId.value) return

  try {
    await deleteIncident(deleteId.value)
    showDeleteDialog.value = false
    deleteId.value = null
  } catch (error) {
    console.error('Failed to delete incident:', error)
  }
}

function goToIncidentPage(page: number) {
  if (page >= 1 && page <= (incidentPagination.value?.totalPages || 1)) {
    currentIncidentPage.value = page
  }
}

// Helper functions
function formatTimestamp(timestamp: string): string {
  // MySQL stores UTC, append Z so browser converts to local timezone
  const utcDate = new Date(timestamp.replace(' ', 'T') + 'Z')
  return formatDistanceToNow(utcDate, { addSuffix: true })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Ongoing'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function getSeverityVariant(severity: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (severity === 'critical') return 'destructive'
  if (severity === 'major') return 'secondary'
  return 'outline'
}

function getTypeColor(type: string): string {
  if (type === 'crash') return 'text-red-500'
  if (type === 'shutdown') return 'text-gray-400'
  if (type === 'reboot') return 'text-green-400'
  if (type === 'copyover') return 'text-cyan-400'
  if (type === 'maintenance') return 'text-blue-500'
  if (type === 'degraded') return 'text-yellow-500'
  if (type === 'outage') return 'text-purple-500'
  return 'text-gray-500'
}
</script>

<template>
  <div class="container mx-auto py-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Server Health</h1>
        <p class="text-muted-foreground">Real-time metrics, crash logs, and incident management</p>
      </div>

      <div v-if="status" class="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <div class="flex items-center gap-2 cursor-help">
                <component :is="statusIcon" :class="['h-5 w-5', status.status === 'operational' ? 'text-green-400' : status.status === 'degraded' ? 'text-orange-400' : 'text-red-500']" />
                <Badge :class="statusColor">{{ status.status }}</Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent class="bg-gray-900 border-gray-700">
              <p :class="['font-semibold', status.status === 'operational' ? 'text-green-400' : status.status === 'degraded' ? 'text-orange-400' : 'text-red-500']">
                {{ status.message }}
              </p>
              <p class="text-xs text-gray-400 mt-1">Status updates every 30 seconds</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="w-full" :class="hasTerminalAccess ? 'grid grid-cols-4' : 'grid grid-cols-3'">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="reboots">Server Reboots</TabsTrigger>
        <TabsTrigger value="incidents">Incidents</TabsTrigger>
        <TabsTrigger v-if="hasTerminalAccess" value="terminal" class="gap-1.5">
          <Terminal class="h-4 w-4" />
          Terminal
        </TabsTrigger>
      </TabsList>

      <!-- Overview Tab -->
      <TabsContent value="overview" class="space-y-6">
        <div v-if="isLoading" class="space-y-6">
          <!-- Skeleton for Metrics Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card v-for="i in 7" :key="i">
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <Skeleton class="h-4 w-24" />
                <Skeleton class="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton class="h-8 w-20 mb-2" />
                <Skeleton class="h-3 w-32 mb-1" />
                <Skeleton class="h-3 w-28" />
              </CardContent>
            </Card>
          </div>

          <!-- Skeleton for Charts Section -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <Skeleton class="h-8 w-48" />
              <Skeleton class="h-9 w-[180px]" />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card v-for="i in 4" :key="i">
                <CardHeader>
                  <Skeleton class="h-6 w-32 mb-2" />
                  <Skeleton class="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton class="h-[200px] w-full" />
                </CardContent>
              </Card>
            </div>
          </div>

          <!-- Skeleton for Recent Incidents -->
          <Card>
            <CardHeader>
              <Skeleton class="h-6 w-40 mb-2" />
              <Skeleton class="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div class="space-y-4">
                <div v-for="i in 3" :key="i" class="flex items-start gap-4 p-4 border rounded-lg">
                  <Skeleton class="h-5 w-5 rounded-full mt-0.5" />
                  <div class="flex-1 space-y-2">
                    <div class="flex items-center gap-2">
                      <Skeleton class="h-4 w-24" />
                      <Skeleton class="h-5 w-32" />
                    </div>
                    <Skeleton class="h-4 w-full" />
                    <Skeleton class="h-3 w-32" />
                  </div>
                  <Skeleton class="h-8 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-else-if="currentHealth" class="space-y-6">
          <!-- Real-time Metrics Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- MUD Server Status -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">MUD Server</CardTitle>
                <Activity class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {{ currentHealth.mudIsRunning ? 'Online' : 'Offline' }}
                </div>
                <p class="text-xs text-muted-foreground">
                  Uptime: {{ formatUptime(currentHealth.mudUptimeSeconds) }}
                </p>
                <p class="text-xs text-muted-foreground">
                  CPU: {{ currentHealth.mudCpuPercent.toFixed(1) }}% | Memory: {{ formatBytes(currentHealth.mudMemoryMb) }}
                </p>
              </CardContent>
            </Card>

            <!-- Server Uptime -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">Server Uptime</CardTitle>
                <Clock class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {{ formatUptime(serverUptime) }}
                </div>
                <p class="text-xs text-muted-foreground">
                  Linux system uptime
                </p>
              </CardContent>
            </Card>

            <!-- Uptime Percentage -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">90-Day Uptime</CardTitle>
                <CheckCircle2 class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div v-if="!isLoadingUptime" class="text-2xl font-bold text-green-500">
                  {{ uptime == null ? 'No data' : `${uptime.toFixed(2)}%` }}
                </div>
                <div v-else class="text-2xl font-bold">Loading...</div>
                <p class="text-xs text-muted-foreground">
                  Last 90 days
                </p>
              </CardContent>
            </Card>

            <!-- Online Players -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">Online Players</CardTitle>
                <Users class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">{{ currentHealth.onlinePlayers }}</div>
                <p class="text-xs text-muted-foreground">
                  Players currently connected
                </p>
              </CardContent>
            </Card>

            <!-- WebSocket Connections -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">WebSocket</CardTitle>
                <Wifi class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">{{ currentHealth.websocketConnections }}</div>
                <p class="text-xs text-muted-foreground">
                  Active connections
                </p>
              </CardContent>
            </Card>

            <!-- Crashes -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">Crashes</CardTitle>
                <AlertTriangle class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold" :class="currentHealth.crashesLast24h > 0 ? 'text-red-500' : 'text-green-500'">
                  {{ currentHealth.crashesLast24h }}
                </div>
                <p class="text-xs text-muted-foreground">
                  Last 24 hours ({{ currentHealth.crashesLastHour }} last hour)
                </p>
              </CardContent>
            </Card>

            <!-- System Load -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">System Load</CardTitle>
                <Activity class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">{{ currentHealth.systemLoad1m }}</div>
                <p class="text-xs text-muted-foreground">
                  1m: {{ currentHealth.systemLoad1m }} | 5m: {{ currentHealth.systemLoad5m }} | 15m: {{ currentHealth.systemLoad15m }}
                </p>
              </CardContent>
            </Card>

            <!-- Database Status -->
            <Card>
              <CardHeader class="flex flex-row items-center justify-between pb-2">
                <CardTitle class="text-sm font-medium">Database</CardTitle>
                <Database class="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {{ currentHealth.dbConnected ? 'Connected' : 'Disconnected' }}
                </div>
                <p class="text-xs text-muted-foreground">
                  Query time: {{ currentHealth.dbQueryTimeMs }}ms
                </p>
                <p class="text-xs text-muted-foreground">
                  Pool: {{ currentHealth.dbConnectionPoolUsed }}/{{ currentHealth.dbConnectionPoolTotal }}
                </p>
              </CardContent>
            </Card>
          </div>

          <!-- Historical Charts Section -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-2xl font-bold">Historical Metrics</h2>
              <Select :model-value="selectedPeriod.toString()" @update:model-value="(val) => val && setPeriod(parseInt(String(val)))">
                <SelectTrigger class="w-[180px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Last 6 hours</SelectItem>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                  <SelectItem value="168">Last 7 days</SelectItem>
                  <SelectItem value="720">Last 30 days</SelectItem>
                  <SelectItem value="2160">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="isLoadingHistory" class="text-center py-8">Loading historical data...</div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- CPU Chart -->
              <Card>
                <CardHeader>
                  <CardTitle>CPU Usage</CardTitle>
                  <CardDescription>MUD process CPU percentage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div class="h-[200px]">
                    <LineChart :data="cpuChartData" :options="chartOptions" :height="200" />
                  </div>
                </CardContent>
              </Card>

              <!-- Memory Chart -->
              <Card>
                <CardHeader>
                  <CardTitle>Memory Usage</CardTitle>
                  <CardDescription>MUD process memory consumption</CardDescription>
                </CardHeader>
                <CardContent>
                  <div class="h-[200px]">
                    <LineChart :data="memoryChartData" :options="chartOptions" :height="200" />
                  </div>
                </CardContent>
              </Card>

              <!-- Players Chart -->
              <Card>
                <CardHeader>
                  <CardTitle>Online Players</CardTitle>
                  <CardDescription>Player count over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div class="h-[200px]">
                    <LineChart :data="playersChartData" :options="chartOptions" :height="200" />
                  </div>
                </CardContent>
              </Card>

              <!-- Database Chart -->
              <Card>
                <CardHeader>
                  <CardTitle>Database Performance</CardTitle>
                  <CardDescription>Query response time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div class="h-[200px]">
                    <LineChart :data="dbChartData" :options="chartOptions" :height="200" />
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>

        </div>
      </TabsContent>

      <!-- Server Reboots Tab -->
      <TabsContent value="reboots" class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold">Server Reboots</h2>
          <p class="text-muted-foreground">Track server uptime, reboots, and stability metrics</p>
        </div>

        <!-- Current Uptime Card -->
        <ServerUptimeCard />

        <!-- Uptime Statistics -->
        <div>
          <h3 class="text-xl font-semibold mb-4">Uptime Statistics</h3>
          <UptimeStatsCards />
        </div>

        <!-- Reboot History -->
        <Card>
          <CardHeader>
            <CardTitle>Reboot History</CardTitle>
            <CardDescription>Complete history of server boots and shutdowns</CardDescription>
          </CardHeader>
          <CardContent>
            <RebootHistoryTable />
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Incidents Tab -->
      <TabsContent value="incidents" class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold">Incidents</h2>
            <p class="text-muted-foreground">Manage server incidents and maintenance windows</p>
          </div>
          <Button @click="openCreateDialog" size="sm">
            <Plus class="h-4 w-4 mr-2" />
            Create Incident
          </Button>
        </div>

        <!-- Date Range Filter -->
        <Card>
          <CardContent class="pt-6">
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <Label for="date-range-filter" class="mb-2 block">Filter by Date Range</Label>
                <div class="relative">
                  <input
                    ref="dateRangeInput"
                    id="date-range-filter"
                    type="text"
                    placeholder="Select date range"
                    class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  />
                  <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <Calendar class="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
              <div class="flex items-end">
                <Button
                  @click="clearDateFilter"
                  variant="outline"
                  size="sm"
                  :disabled="!incidentDateFilter.from && !incidentDateFilter.to"
                  class="mb-0"
                >
                  <X class="h-4 w-4 mr-1" />
                  Clear Filter
                </Button>
              </div>
            </div>
            <div v-if="incidentDateFilter.from && incidentDateFilter.to" class="mt-2 text-sm text-muted-foreground">
              Showing incidents from {{ incidentDateFilter.from }} to {{ incidentDateFilter.to }}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="pt-6">
            <div v-if="isLoadingIncidentsList">
              <!-- Skeleton for Table -->
              <div class="space-y-4">
                <!-- Table Header Skeleton -->
                <div class="grid grid-cols-8 gap-4 pb-3 border-b">
                  <Skeleton class="h-4 w-16" />
                  <Skeleton class="h-4 w-20" />
                  <Skeleton class="h-4 w-24" />
                  <Skeleton class="h-4 w-20" />
                  <Skeleton class="h-4 w-20" />
                  <Skeleton class="h-4 w-16" />
                  <Skeleton class="h-4 w-16" />
                  <Skeleton class="h-4 w-20 ml-auto" />
                </div>

                <!-- Table Rows Skeleton -->
                <div v-for="i in 10" :key="i" class="grid grid-cols-8 gap-4 py-4 border-b">
                  <Skeleton class="h-4 w-14" />
                  <Skeleton class="h-5 w-16 rounded-full" />
                  <Skeleton class="h-4 w-32" />
                  <Skeleton class="h-4 w-24" />
                  <Skeleton class="h-4 w-16" />
                  <div class="flex items-center gap-2">
                    <Skeleton class="h-4 w-4 rounded-full" />
                    <Skeleton class="h-4 w-16" />
                  </div>
                  <Skeleton class="h-4 w-4" />
                  <div class="flex items-center justify-end gap-2">
                    <Skeleton class="h-8 w-8" />
                    <Skeleton class="h-8 w-8" />
                  </div>
                </div>

                <!-- Pagination Skeleton -->
                <div class="flex items-center justify-between mt-4 pt-4">
                  <div class="flex items-center gap-2">
                    <Skeleton class="h-4 w-12" />
                    <Skeleton class="h-9 w-20" />
                    <Skeleton class="h-4 w-48" />
                  </div>
                  <div class="flex gap-2">
                    <Skeleton class="h-9 w-9" />
                    <Skeleton class="h-9 w-9" />
                    <Skeleton class="h-9 w-9" />
                    <Skeleton class="h-9 w-9" />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="incidents && incidents.length > 0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Public</TableHead>
                    <TableHead class="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="incident in incidents" :key="incident.id">
                    <TableCell>
                      <span :class="['font-medium capitalize', getTypeColor(incident.incident_type)]">
                        {{ incident.incident_type }}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="getSeverityVariant(incident.severity)" class="text-xs">
                        {{ incident.severity }}
                      </Badge>
                    </TableCell>
                    <TableCell class="max-w-xs truncate">{{ incident.title }}</TableCell>
                    <TableCell class="text-sm text-muted-foreground">
                      {{ formatTimestamp(incident.started_at) }}
                    </TableCell>
                    <TableCell class="text-sm">{{ formatDuration(incident.duration_seconds) }}</TableCell>
                    <TableCell>
                      <div class="flex items-center gap-2">
                        <CheckCircle2 v-if="incident.resolved" class="h-4 w-4 text-green-500" />
                        <XCircle v-else class="h-4 w-4 text-red-500" />
                        <span class="text-sm">{{ incident.resolved ? 'Resolved' : 'Ongoing' }}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Check v-if="incident.public_visible" class="h-4 w-4 text-green-500" />
                      <X v-else class="h-4 w-4 text-red-500" />
                    </TableCell>
                    <TableCell class="text-right" @click.stop>
                      <div class="flex items-center justify-end gap-2">
                        <Button @click="openEditDialog(incident)" variant="outline" size="sm">
                          <Pencil class="h-4 w-4" />
                        </Button>
                        <Button @click="openDeleteDialog(incident.id)" variant="destructive" size="sm">
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Pagination Controls -->
              <div class="flex items-center justify-between mt-4">
                <div class="flex items-center gap-2 whitespace-nowrap">
                  <span class="text-sm text-muted-foreground">Show</span>
                  <Select :model-value="incidentPageSize.toString()" @update:model-value="(val) => val && changeIncidentPageSize(parseInt(String(val)))">
                    <SelectTrigger class="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span class="text-sm text-muted-foreground whitespace-nowrap">
                    entries ({{ ((currentIncidentPage - 1) * incidentPageSize) + 1 }} to {{ Math.min(currentIncidentPage * incidentPageSize, incidentPagination?.total || 0) }} of {{ incidentPagination?.total || 0 }})
                  </span>
                </div>

                <div v-if="incidentPagination && incidentPagination.totalPages > 1">
                  <PaginationWithEllipsis
                    :current-page="currentIncidentPage"
                    :total-pages="incidentPagination.totalPages"
                    @page-change="goToIncidentPage"
                  />
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8 text-muted-foreground">
              No incidents found. Create one to get started.
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Terminal Tab (Requires terminal_access permission) -->
      <TabsContent v-if="hasTerminalAccess" value="terminal" class="h-[700px] min-h-0 flex-none">
        <Card class="h-full min-h-0">
          <CardHeader class="pb-2">
            <div class="flex items-center justify-between">
              <div>
                <CardTitle class="flex items-center gap-2">
                  <Terminal class="h-5 w-5" />
                  MUD Server Terminal
                </CardTitle>
                <CardDescription>
                  Sandboxed shell access to the MUD folder. Auto-attaches to existing screen session.
                </CardDescription>
              </div>
              <Badge variant="outline" class="text-xs">
                Overlord Access Only
              </Badge>
            </div>
          </CardHeader>
          <CardContent class="min-h-0 flex-1 p-0">
            <WebTerminal />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- Create Incident Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Incident</DialogTitle>
          <DialogDescription>
            Create a new server incident or maintenance window for public display.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="create-type">Type</Label>
              <Select v-model="createForm.incident_type">
                <SelectTrigger id="create-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crash">Crash</SelectItem>
                  <SelectItem value="shutdown">Shutdown</SelectItem>
                  <SelectItem value="reboot">Reboot</SelectItem>
                  <SelectItem value="copyover">Copyover</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="degraded">Degraded</SelectItem>
                  <SelectItem value="outage">Outage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label for="create-severity">Severity</Label>
              <Select v-model="createForm.severity">
                <SelectTrigger id="create-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="create-title">Title</Label>
            <Input id="create-title" v-model="createForm.title" placeholder="Brief incident title" />
          </div>

          <div class="space-y-2">
            <Label for="create-description">Description</Label>
            <Textarea
              id="create-description"
              v-model="createForm.description"
              placeholder="User-friendly description (avoid technical jargon)"
              rows="3"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="create-started">Started At</Label>
              <Input id="create-started" v-model="createForm.started_at" type="datetime-local" />
            </div>

            <div class="space-y-2">
              <Label for="create-ended">Ended At (Optional)</Label>
              <Input id="create-ended" v-model="createForm.ended_at" type="datetime-local" />
            </div>
          </div>

          <div class="flex items-center justify-between">
            <Label for="create-resolved" class="cursor-pointer">Mark as resolved</Label>
            <Switch id="create-resolved" :model-value="createForm.resolved ?? false" @update:model-value="(val) => createForm.resolved = val" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="create-public" class="cursor-pointer">Show on public status page</Label>
            <Switch id="create-public" :model-value="createForm.public_visible ?? false" @update:model-value="(val) => createForm.public_visible = val" />
          </div>
        </div>

        <DialogFooter>
          <Button @click="showCreateDialog = false" variant="outline" :disabled="isCreating">
            Cancel
          </Button>
          <Button @click="handleCreate" :disabled="isCreating || !createForm.title">
            {{ isCreating ? 'Creating...' : 'Create Incident' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit Incident Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent class="!max-w-[80vw] max-h-[90vh] overflow-y-auto" v-if="editForm">
        <DialogHeader>
          <DialogTitle>Edit Incident</DialogTitle>
          <DialogDescription>
            Update incident details for public display.
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-6 py-4">
          <!-- Basic Incident Information -->
          <div class="space-y-4">
            <h3 class="font-semibold text-lg border-b pb-2">Incident Information</h3>

            <div class="grid grid-cols-4 gap-4">
              <div class="space-y-2">
                <Label for="edit-type">Type</Label>
                <Select v-model="editForm.incident_type">
                  <SelectTrigger id="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crash">Crash</SelectItem>
                    <SelectItem value="shutdown">Shutdown</SelectItem>
                    <SelectItem value="reboot">Reboot</SelectItem>
                    <SelectItem value="copyover">Copyover</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="outage">Outage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div class="space-y-2">
                <Label for="edit-severity">Severity</Label>
                <Select v-model="editForm.severity">
                  <SelectTrigger id="edit-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div class="flex items-center space-x-2">
                <Switch id="edit-resolved" :model-value="editForm.resolved ?? false" @update:model-value="(val) => { if (editForm) editForm.resolved = val }" />
                <Label for="edit-resolved" class="cursor-pointer">Resolved</Label>
              </div>

              <div class="flex items-center space-x-2">
                <Switch id="edit-public" :model-value="editForm.public_visible ?? false" @update:model-value="(val) => { if (editForm) editForm.public_visible = val }" />
                <Label for="edit-public" class="cursor-pointer">Public</Label>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="edit-title">Title</Label>
              <Input id="edit-title" v-model="editForm.title" placeholder="Brief incident title" />
            </div>

            <div class="space-y-2">
              <Label for="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                v-model="editForm.description"
                placeholder="User-friendly description (avoid technical jargon)"
                rows="2"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="edit-started">Started At</Label>
                <Input id="edit-started" :model-value="editForm.started_at" type="datetime-local" readonly class="bg-muted" />
              </div>

              <div class="space-y-2">
                <Label for="edit-ended">Ended At (Optional)</Label>
                <div class="relative">
                  <input
                    ref="editEndedAtInput"
                    id="edit-ended"
                    type="text"
                    placeholder="Select date and time"
                    class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  />
                  <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                      <line x1="16" x2="16" y1="2" y2="6"/>
                      <line x1="8" x2="8" y1="2" y2="6"/>
                      <line x1="3" x2="21" y1="10" y2="10"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="edit-resolution">Resolution Notes (Optional)</Label>
              <Textarea
                id="edit-resolution"
                v-model="editForm.resolution_notes"
                placeholder="Internal notes about the resolution"
                rows="2"
              />
            </div>
          </div>

          <!-- Crash Forensic Details (for crash-type incidents) -->
          <div v-if="editForm.incident_type === 'crash'" class="space-y-4">
            <h3 class="font-semibold text-lg border-b pb-2">Crash Forensic Details</h3>

            <div class="grid grid-cols-4 gap-4">
              <div class="space-y-2">
                <Label>Exit Code</Label>
                <Input :model-value="editForm.exit_code || 'N/A'" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label>Signal</Label>
                <Input :model-value="editForm.crash_signal || 'N/A'" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label>PID</Label>
                <Input :model-value="editForm.pid || 'N/A'" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label>Players Online</Label>
                <Input :model-value="editForm.online_players || '0'" readonly class="bg-muted" />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-2">
                <Label>Uptime</Label>
                <Input :model-value="formatCrashUptime(editForm.uptime_seconds || null)" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label>Memory (MiB)</Label>
                <Input :model-value="editForm.memory_mb?.toFixed(1) || 'N/A'" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label>CPU %</Label>
                <Input :model-value="editForm.cpu_percent?.toFixed(1) || 'N/A'" readonly class="bg-muted" />
              </div>
            </div>

            <div v-if="editForm.crash_function">
              <Label>Crash Location</Label>
              <pre class="bg-muted p-3 rounded text-sm font-mono">{{ editForm.crash_function }}
{{ editForm.crash_file }}:{{ editForm.crash_line }}</pre>
            </div>

            <div v-if="editForm.backtrace">
              <div class="flex items-center justify-between mb-2">
                <Label>GDB Backtrace</Label>
                <Button
                  @click="copyBacktraceToClipboard"
                  variant="outline"
                  size="sm"
                  class="h-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                >
                  <Copy class="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre class="bg-muted p-3 rounded text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">{{ editForm.backtrace }}</pre>
            </div>

            <div class="space-y-2">
              <Label>Context Logs (hover for details)</Label>
              <div class="grid grid-cols-5 gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 p-2 border rounded bg-muted/50 cursor-help">
                        <Info class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm">wholist</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-md max-h-[400px] overflow-y-auto">
                      <pre class="text-xs font-mono whitespace-pre-wrap">{{ editForm.wholist_snapshot || 'No data' }}</pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 p-2 border rounded bg-muted/50 cursor-help">
                        <Info class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm">cmd.debug</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-md">
                      <pre class="text-xs font-mono whitespace-pre-wrap">{{ editForm.cmd_debug_last3 ? editForm.cmd_debug_last3.split('\n').slice(-3).join('\n') : 'No data' }}</pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 p-2 border rounded bg-muted/50 cursor-help">
                        <Info class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm">debug</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-md max-h-[300px] overflow-y-auto">
                      <pre class="text-xs font-mono whitespace-pre-wrap">{{ editForm.debug_log_excerpt ? editForm.debug_log_excerpt.split('\n').slice(-3).join('\n') : 'No data' }}</pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 p-2 border rounded bg-muted/50 cursor-help">
                        <Info class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm">status</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-md">
                      <pre class="text-xs font-mono whitespace-pre-wrap">{{ editForm.status_log_last3 ? editForm.status_log_last3.split('\n').slice(-3).join('\n') : 'No data' }}</pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex items-center gap-2 p-2 border rounded bg-muted/50 cursor-help">
                        <Info class="h-4 w-4 text-muted-foreground" />
                        <span class="text-sm">wizcmds</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-md">
                      <pre class="text-xs font-mono whitespace-pre-wrap">{{ editForm.wizcmds_last3 ? editForm.wizcmds_last3.split('\n').slice(-3).join('\n') : 'No data' }}</pre>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t">
              <div>
                <Label>Mark as Analyzed</Label>
                <p class="text-xs text-muted-foreground">Forensic review completed by admin</p>
              </div>
              <Switch :model-value="Boolean(editForm.analyzed)" @update:model-value="(val) => { if (editForm) editForm.analyzed = val }" />
            </div>

            <div>
              <Label for="edit-crash-notes">Crash Analysis Notes</Label>
              <Textarea
                id="edit-crash-notes"
                v-model="editForm.notes"
                placeholder="Technical analysis of the crash (root cause, fix applied, etc.)"
                rows="3"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button @click="showEditDialog = false" variant="outline" :disabled="isUpdating">
            Cancel
          </Button>
          <Button @click="handleUpdate" :disabled="isUpdating || !editForm.title">
            {{ isUpdating ? 'Updating...' : 'Update Incident' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Incident</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this incident? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isDeleting">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleDelete" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style>
.flatpickr-wrapper {
  width: 100%;
}
</style>
