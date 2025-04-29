import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';

interface Operation {
  type: 'insert' | 'delete';
  position: number;
  character?: string;
  clientId: string;
  timestamp: number;
}

class TextDocument {
  private content: string = '';
  private operations: Operation[] = [];
  private pendingOperations: Map<string, Operation[]> = new Map();

  applyOperation(op: Operation): void {
    // Transform against pending operations
    const transformedOp = this.transformOperation(op);
    
    if (transformedOp.type === 'insert') {
      this.content = 
        this.content.slice(0, transformedOp.position) + 
        transformedOp.character + 
        this.content.slice(transformedOp.position);
    } else {
      this.content = 
        this.content.slice(0, transformedOp.position) + 
        this.content.slice(transformedOp.position + 1);
    }
    
    this.operations.push(transformedOp);
  }

  private transformOperation(op: Operation): Operation {
    const pendingOps = this.pendingOperations.get(op.clientId) || [];
    let transformedOp = { ...op };

    for (const pendingOp of pendingOps) {
      if (pendingOp.type === 'insert' && pendingOp.position <= transformedOp.position) {
        transformedOp.position++;
      } else if (pendingOp.type === 'delete' && pendingOp.position < transformedOp.position) {
        transformedOp.position--;
      }
    }

    return transformedOp;
  }

  getContent(): string {
    return this.content;
  }

  getOperationsSince(timestamp: number): Operation[] {
    return this.operations.filter(op => op.timestamp > timestamp);
  }
}

const wss = new WebSocketServer({ port: 8080 });
const document = new TextDocument();

wss.on('connection', (ws) => {
  const clientId = uuid();
  
  ws.send(JSON.stringify({
    type: 'init',
    content: document.getContent(),
    clientId
  }));

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    
    if (data.type === 'operation') {
      const op: Operation = {
        ...data.operation,
        clientId,
        timestamp: Date.now()
      };
      
      document.applyOperation(op);
      
      // Broadcast to all clients except sender
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'operation',
            operation: op
          }));
        }
      });
    }
  });
});
