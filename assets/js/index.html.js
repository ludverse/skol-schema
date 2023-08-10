
const VERSION = 3;
import { createApp } from "https://unpkg.com/petite-vue?module";

createApp({
    modal: null,
    modalType: null,
    modalInput: null,
    schedule: {
        version: 3,
        label: "",
        revision: "ht23.0.0",
        begin: 480,
        end: 900,
        colors: {
            red: "#fc5c65",
            orange: "#fd9644",
            yellow: "#fed330",
            green: "#26de81",
            turquoise: "#2bcbba",
            aqua: "#45aaf2",
            blue: "#4b7bec",
            purple: "#a55eea",
            gray: "#a3a3a3",
            black: "#4b6584"
        },
        teachers: [{
            id: "a",
            name: "Nils"
        }, {
            id: "b",
            name: "Elin"
        }],
        templates: [],
        exeptions: [],
        subjects: []
    },
    scheduleScale: 2,
    tags: [ ],
    today: (new Date().getDay()),
    now: (new Date().getHours() * 60 + new Date().getMinutes()),
    tagCreationPlaceholder: NaN,
    loaded: false,
    warning: "",

    humanTime: (time, padHours = false) => {
        return `${ Math.floor(time % 1440 / 60).toString().padStart(padHours + 1, "0") }:${ (time % 1440 % 60).toString().padStart(2, "0") }`;
    },
    humanDate: date => {
        const dayNames = [ "sön", "mån", "tis", "ons", "tors", "fre", "lör" ]
        const monthNames = [ "jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec" ];
        return `${ dayNames[date.getDay()] } ${ date.getDate() } ${ monthNames[date.getMonth()] }.`;
    },
    scheduleTime: (time, day) => {
        const split = time.split(":");
        return split[0] * 60 + Number(split[1]) + day * 1440;
    },
    dateToTime: date => date.getHours() * 60 + date.getMinutes(),
    mouseYToScheduleTime(clientY) {
        const scheduleCol = document.getElementsByClassName("schedule-col")[0];
        const colRect = scheduleCol.getBoundingClientRect();

        const relativeY = clientY - colRect.top - 4;

        const time = Math.round(relativeY / this.scheduleScale + this.schedule.begin);
        const limited = Math.max(this.schedule.begin, Math.min(this.schedule.end, time));

        return limited;
    },
    template(subject) {
        if (subject.template) {
            return { ...this.schedule.templates.find(template => template.id == subject.template), ...subject };
        } else {
            return subject;
        }
    },
    uuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            var r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    showModal(type, content) {
        const split = type.split(":");
        this.modalType = split.splice(0, 1);
        this.modalArgs = split;
        this.modal = content;
    },

    closeModal() {
        this.modalType = null;
    },

    createTagModal(dayI, e) {
        this.tagCreationPlaceholder = NaN;

        const time = this.mouseYToScheduleTime(e.clientY + window.scrollY);

        this.modalInput = { time: this.humanTime(time, true), label: "" }
        this.showModal("input:tag", {
            done: this.createTag.bind(this, dayI),
            error: null
        });
    },

    createTag(dayI) {
        if (!this.modalInput.label) return this.modal.error = "Skriv in ett namn för markören";

        const time = this.scheduleTime(this.modalInput.time, dayI);
        if (time < this.schedule.begin + 1440 * dayI || time > this.schedule.end + 1440 * dayI) return this.modal.error = "Tiden är utanför schemat";
        
        this.closeModal();
        
        this.tags.push({
            id: this.uuid(),
            label: this.modalInput.label,
            time
        });

        localStorage.setItem("tags", JSON.stringify(this.tags));
    },
    
    removeTag(tagId) {
        const tagI = this.tags.findIndex(tag => tag.id == tagId);
        this.tags.splice(tagI, 1);
        
        localStorage.setItem("tags", JSON.stringify(this.tags));
        
        this.closeModal();
    },

    updateTagCreationPlaceholder(e) {
        if (this.modalType) return;

        if (e.ctrlKey) {
            this.tagCreationPlaceholder = this.mouseYToScheduleTime(e.clientY);
        } else if (this.tagCreationPlaceholder !== NaN) {
            this.tagCreationPlaceholder = NaN;
        }
    },

    mounted() {
        const rawSchedule = localStorage.getItem("schedule");
        if (rawSchedule) {
            this.schedule = JSON.parse(rawSchedule);
        }

        window.addEventListener("keydown", e => {
            if (e.key == "Escape") {
                this.closeModal();
            }
        });

        if (!this.schedule.version || this.schedule.version < VERSION) {
            console.warn("Old schedule version");
            this.warning = "Detta schema är gjort för en äldre version och vissa delar kan sluta fungera.";
        }

        setInterval(() => this.today = (new Date().getDay()), 60000);
        setInterval(() => this.now = (new Date().getHours() * 60 + new Date().getMinutes()), 4000);

        const d = new Date();
        const tagsExpire = localStorage.getItem("tagsExpire");
        if (!tagsExpire || tagsExpire < d.getTime()) {
            localStorage.setItem("tags", "[]");

            const midnight = new Date(d.getTime());
            midnight.setHours(0, 0, 0, 0);
            const nextExpire = new Date(midnight.setDate(midnight.getDate() + ((7 - midnight.getDay() + 1) % 7 || 7)));
            localStorage.setItem("tagsExpire", nextExpire.getTime());
        } else {
            this.tags = JSON.parse(localStorage.getItem("tags"));
        }

        this.loaded = true;

        const params = new URLSearchParams(location.search);
        if (params.get("print") == "1") {
            this.print();
        }
    },
}).mount();

