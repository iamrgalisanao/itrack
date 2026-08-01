import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateInput(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export function getStatusColor(status) {
  const colors = {
    backlog: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    for_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    blocked: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    delayed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  }
  return colors[status] || colors.not_started
}

export function getStatusLabel(status) {
  const labels = {
    backlog: 'Backlog',
    not_started: 'Not Started',
    in_progress: 'In Progress',
    for_review: 'For Review',
    completed: 'Completed',
    blocked: 'Blocked',
    delayed: 'Delayed',
  }
  return labels[status] || status
}

export function getTypeColor(type) {
  const colors = {
    A: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    SA: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    M: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  }
  return colors[type] || 'bg-gray-100 text-gray-700'
}

export function getTypeLabel(type) {
  const labels = {
    A: 'Activity',
    SA: 'Sub-Activity',
    M: 'Milestone',
  }
  return labels[type] || type
}