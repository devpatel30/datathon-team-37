import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from './ui/button'

const visualizations = [
  {
    id: 'semantic',
    title: 'Semantic Network',
    description: 'View relationships between companies and regulations',
    file: 'semantic_network.html'
  },
  {
    id: 'company',
    title: 'Company Focus',
    description: 'Explore company-specific regulatory impacts',
    file: 'company_focus.html'
  },
  {
    id: 'directive',
    title: 'Directive Focus',
    description: 'Analyze directive impacts across companies',
    file: 'directive_focus.html'
  },
  {
    id: 'highlighted',
    title: 'Highlighted Network',
    description: 'View highlighted relationships in the network',
    file: 'highlighted_network.html'
  }
]

export function Visualizations() {
  const [activeViz, setActiveViz] = useState(visualizations[0])

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Network Visualizations</CardTitle>
        <CardDescription>Explore relationships between companies and regulations</CardDescription>
        <div className="flex flex-wrap gap-2">
          {visualizations.map((viz) => (
            <Button
              key={viz.id}
              variant={activeViz.id === viz.id ? "default" : "outline"}
              onClick={() => setActiveViz(viz)}
            >
              {viz.title}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full h-[600px] rounded-b-lg overflow-hidden">
          <iframe 
            src={`/visualizations/${activeViz.file}`}
            className="absolute inset-0 w-full h-full border-0"
            title={activeViz.title}
          />
        </div>
      </CardContent>
    </Card>
  )
}