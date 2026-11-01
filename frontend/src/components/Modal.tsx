import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type {ReactNode} from 'react';
export function Modal({open,onClose,title,description,children,wide=false}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;wide?:boolean}) {
  return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose()}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={`modal-content ${wide?'modal-wide':''}`} aria-describedby={description?'modal-description':undefined}>
    <div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description&&<Dialog.Description id="modal-description">{description}</Dialog.Description>}</div><Dialog.Close className="icon-button" aria-label="Закрыть"><X size={20}/></Dialog.Close></div>{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
