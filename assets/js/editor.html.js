import * as vue from "https://unpkg.com/petite-vue?module";

function HintPopup(props) {
    return {
        $template: "#hint-popup",
        hintId: props.hintId,
        desc: props.desc,
        shown: props.shown
    }
}

const app = vue.createApp({
    HintPopup,

    schedule: DEFAULT_SCHEDULE,
    colours: DEFAULT_COLOURS,

    modal: null,
    modalType: null,
    modalArgs: [],
    modalInput: null,
    scheduleScale: 2,
    scheduleTeacherInput: "",
    subjectCreationPlaceholder: NaN,
    loaded: false,
    warning: "",
    templateFilter: null,
    configMenus: [],
    isPreview: false,
    allowConfigMenuToggling: true,
    hasUnsavedChanges: false,
    shouldSkipUnsavedMessage: false,
    showingHints: [],
    discoveredHints: [],

    humanTime: (time, padHours = false) => {
        return `${ Math.floor(time % 1440 / 60).toString().padStart(padHours + 1, "0") }:${ (time % 1440 % 60).toString().padStart(2, "0") }`;
    },
    humanDate: date => {
        const dayNames = [ "sön", "mån", "tis", "ons", "tors", "fre", "lör" ]
        const monthNames = [ "jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec" ];
        return `${ dayNames[date.getDay()] } ${ date.getDate() } ${ monthNames[date.getMonth()] }.`;
    },
    scheduleTime: (time, day = 0) => {
        const split = time.split(":");
        return split[0] * 60 + Number(split[1]) + day * 1440;
    },
    dateToTime: date => date.getHours() * 60 + date.getMinutes(),
    arrayEquals: (a, b) => {
        return Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((val, index) => val === b[index]);
    },
    uuid: () => {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            var r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    useDarkColourOnBg: bgColour => {
        const hexString = bgColour.charAt(0) == "#" ? bgColour.substring(1, 7) : bgColour;
        const r = parseInt(hexString.substring(0, 2), 16);
        const g = parseInt(hexString.substring(2, 4), 16);
        const b = parseInt(hexString.substring(4, 6), 16);

        return ((r * 0.299) + (g * 0.587) + (b * 0.114)) > 210;
    },
    mouseYToScheduleTime(clientY) {
        const scheduleCol = document.getElementsByClassName("schedule-col")[0];
        const colRect = scheduleCol.getBoundingClientRect();

        const relativeY = clientY - colRect.top - 4;

        const time = Math.round(relativeY / this.scheduleScale + this.schedule.begin);
        const limited = Math.max(this.schedule.begin, Math.min(this.schedule.end, time));

        return limited;
    },
    template(subject, modifyColour = false) {
        let templated = subject;
        if (subject.template) {
            templated =  { ...this.schedule.templates.find(template => template.id == subject.template), ...subject };
        }

        if (modifyColour) {
            templated = {
                ...templated,
                color: this.colours.find(colour => colour.id == templated.color)
            }
        }

        return templated;
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

    editScheduleBegin() {
        if (!this.scheduleBeginInput) return;
        this.schedule.begin = this.scheduleTime(this.scheduleBeginInput);

        this.markUnsaved();
    },

    editScheduleEnd() {
        if (!this.scheduleEndInput) return;
        this.schedule.end = this.scheduleTime(this.scheduleEndInput);

        this.markUnsaved();
    },

    subjectCreateModal(dayI, e) {
        this.subjectCreationPlaceholder = NaN;
        this.markHintDiscovered(0);

        const begin = Math.round(this.mouseYToScheduleTime(e.clientY) / 5) * 5;

        this.modalInput = {
            name: "",
            begin: this.humanTime(begin, true),
            end: this.humanTime(begin + 60, true),
            timeDifference: 60,
            teachers: [ "null" ],
            color: this.colours[0].id
        }
        this.showModal("input:subject", {
            label: "Nytt ämne",
            done: this.createSubject.bind(this, dayI),
            error: null
        });
    },

    subjectEditModal(subjectId) {
        const subject = this.schedule.subjects.find(subject => subject.id == subjectId);

        this.modalInput = {
            template: subject.template,
            name: this.template(subject).name,
            begin: this.humanTime(subject.begin, true),
            end: this.humanTime(subject.begin + subject.length, true),
            timeDifference: subject.length,
            teachers: [ ...this.template(subject).teachers, "null" ],
            color: this.template(subject).color
        }

        this.showModal("input:subject", {
            label: "Redigera ämne",
            done: this.editSubject.bind(this, subjectId),
            error: null
        });
    },

    editSubjectTemplate() {
        if (this.modalInput.template == "null") return;
        const template = this.schedule.templates.find(template => template.id == this.modalInput.template);

        let teachers = [ ...template.teachers, "null" ];
        Object.assign(this.modalInput, { ...template, teachers });
    },

    editSubjectBeginTime() {
        if (!this.modalInput.begin) return;
        this.modalInput.end = this.humanTime(this.scheduleTime(this.modalInput.begin) + this.modalInput.timeDifference, true);
    },

    editSubjectEndTime() {
        if (!this.modalInput.end) return;
        this.modalInput.timeDifference = this.scheduleTime(this.modalInput.end) - this.scheduleTime(this.modalInput.begin);
    },

    editSubjectTeacher(i) {
        if (this.modalInput.teachers[i] == "null") {
            this.modalInput.teachers.length = i + 1;
        } else {
            if (this.modalInput.teachers[this.modalInput.teachers.length - 1] == "null") return;
            this.modalInput.teachers.push("null");
        }
    },

    verifySubjectModal(dayI) {
        const getErrMessage = () => {
            if (!this.modalInput.name) return "Skriv in ett namn för ämnet";
            if (this.modalInput.teachers.length <= 1) return "Skriv in minst 1 lärare";

            const begin = this.scheduleTime(this.modalInput.begin, dayI);
            if (begin < this.schedule.begin + 1440 * dayI || begin > this.schedule.end + 1440 * dayI) return "Starttiden är utanför schemat";

            const length = this.scheduleTime(this.modalInput.end, dayI) - begin;
            if (length <= 0) return "Sluttiden får inte vara före starttiden";
            if (begin + length > this.schedule.end + 1440 * dayI) return "Sluttiden är utanför schemat";
        }

        const errMsg = getErrMessage();
        if (errMsg) {
            this.modal.error = errMsg;
            return false;
        } else {
            return true;
        }
    },

    createSubject(dayI) {
        if (!this.verifySubjectModal(dayI)) return;
        this.closeModal();

        const begin = this.scheduleTime(this.modalInput.begin, dayI);
        const length = this.scheduleTime(this.modalInput.end, dayI) - begin;

        let data = {};
        const template = this.schedule.templates.find(template => template.id == this.modalInput.template);

        if (this.modalInput.template) data.template = this.modalInput.template;
        if (template?.name != this.modalInput.name) data.name = this.modalInput.name;
        const inputTeachers = this.modalInput.teachers.filter(a => a != "null");
        if (!this.arrayEquals(template?.teachers, inputTeachers)) data.teachers = inputTeachers;
        if (template?.color != this.modalInput.color) data.color = this.modalInput.color;

        this.schedule.subjects.push({
            id: this.uuid(),
            ...data,
            begin,
            length
        });
        this.markUnsaved();
    },

    editSubject(subjectId) {
        const subjectI = this.schedule.subjects.findIndex(subject => subject.id == subjectId);
        const dayI = Math.floor(this.schedule.subjects[subjectI].begin / 1440);

        if (!this.verifySubjectModal(dayI)) return;
        this.closeModal();

        const begin = this.scheduleTime(this.modalInput.begin, dayI);
        const length = this.scheduleTime(this.modalInput.end, dayI) - begin;
    
        let data = {};
        const template = this.schedule.templates.find(template => template.id == this.modalInput.template);

        if (this.modalInput.template) data.template = this.modalInput.template;
        if (template?.name != this.modalInput.name) data.name = this.modalInput.name;
        const inputTeachers = this.modalInput.teachers.filter(a => a != "null");
        if (!this.arrayEquals(template?.teachers, inputTeachers)) data.teachers = inputTeachers;
        if (template?.color != this.modalInput.color) data.color = this.modalInput.color;

        this.schedule.subjects[subjectI] = {
            id: subjectId,
            ...data,
            begin,
            length
        }
        this.markUnsaved();
    },

    removeSubject(subjectId) {
        const subjectI = this.schedule.subjects.findIndex(subject => subject.id == subjectId);
        this.schedule.subjects.splice(subjectI, 1);
        this.markUnsaved();

        this.closeModal();
    },

    unsavedModal(e, forwardUrl) {
        if (!this.hasUnsavedChanges || this.isPreview) return;

        this.showModal("unsaved", {
            url: forwardUrl
        });
        e.preventDefault();
    },

    skipUnsavedMessage(forwardUrl) {
        this.shouldSkipUnsavedMessage = true;
        location.replace(forwardUrl);
    },

    saveSchedule() {
        localStorage.setItem("schedule", JSON.stringify(this.schedule));
        this.hasUnsavedChanges = false;
        this.isPreview = false;
    },

    markUnsaved() {
        console.log("unsaved change", this);
        if (!this.hasUnsavedChanges && !this.isPreview) {
            this.hasUnsavedChanges = true;
        }
    },

    shareModal() {
        const urlSafeSchedule = encodeURIComponent(JSON.stringify(this.schedule));
        const shareUrl = `${ location.protocol }//${ location.host }${ location.pathname }?schedule=${ urlSafeSchedule }`;

        this.showModal("share", {
            shareUrl
        });
    },

    copyShareUrl(shareUrl) {
        navigator.clipboard.writeText(shareUrl);
        document.querySelector("#shareUrlField").select();
    },

    editScheduleLengthModal() {
        this.modalInput = {
            scheduleBegin: this.humanTime(this.schedule.begin, true),
            scheduleEnd: this.humanTime(this.schedule.end, true),
        }

        this.showModal("input:schedule-length", {
            done: this.editScheduleLength,
            error: null
        });
    },

    editScheduleLength() {
        if (!this.modalInput.scheduleBegin) return this.modal.error = "Ange en starttid för schemat";
        if (!this.modalInput.scheduleEnd) return this.modal.error = "Ange en sluttid för schemat";

        this.closeModal();

        const begin = this.scheduleTime(this.modalInput.scheduleBegin);
        this.schedule.begin = begin;

        const end = this.scheduleTime(this.modalInput.scheduleEnd);
        this.schedule.end = end;

        this.markUnsaved();
    },

    toggleConfigMenu(menuType) {
        if (!this.allowConfigMenuToggling) return;

        if (this.configMenus.includes(menuType)) {
            this.configMenus.splice(this.configMenus.indexOf(menuType), 1);
        } else {
            this.configMenus.push(menuType);
        }
    },

    addTeacher() {
        this.schedule.teachers.push({
            id: this.uuid(),
            name: this.scheduleTeacherInput
        });
        this.markUnsaved();

        this.scheduleTeacherInput = "";
    },

    removeTeacher(teacherId) {
        const i = this.schedule.teachers.findIndex(teacher => teacher.id == teacherId);
        this.schedule.teachers.splice(i, 1);
        this.markUnsaved();
    },

    startTemplateFilter(id) {
        this.templateFilter = id;
    },

    endTemplateFilter(id) {
        this.templateFilter = null;
    },

    createTemplateModal() {
        this.modalInput = {
            name: "",
            teachers: [ "null" ],
            color: this.colours[0].id
        }

        this.showModal("input:template", {
            label: "Ny ämnesmall",
            done: this.createTemplate,
            error: null
        });
    },

    editTemplateModal(templateId) {
        const template = this.schedule.templates.find(template => template.id == templateId);

        this.modalInput = {
            name: template.name,
            teachers: [ ...template.teachers, "null" ],
            color: template.color
        }

        this.showModal("input:template", {
            label: "Redigera ämnesmall",
            done: this.editTemplate.bind(this, template.id),
            error: null
        });
    },

    createTemplate() {
        if (!this.modalInput.name) return this.modal.error = "Skriv in ett namn för mallen";

        this.closeModal();
        
        const inputTeachers = this.modalInput.teachers.filter(a => a != "null");

        this.schedule.templates.push({
            id: this.uuid(),
            name: this.modalInput.name,
            teachers: inputTeachers,
            color: this.modalInput.color
        });
        this.markUnsaved();
    },

    editTemplate(templateId) {
        if (!this.modalInput.name) return this.modal.error = "Skriv in ett namn för mallen";

        const templateI = this.schedule.templates.findIndex(template => template.id == templateId);

        this.closeModal();
        
        const inputTeachers = this.modalInput.teachers.filter(a => a != "null");

        this.schedule.templates[templateI] = {
            id: templateId,
            name: this.modalInput.name,
            teachers: inputTeachers,
            color: this.modalInput.color
        }
        this.markUnsaved();
    },
    
    updateSubjectCreationPlaceholder(e) {
        if (this.modalType) return;

        if (e.ctrlKey) {
            this.subjectCreationPlaceholder = Math.round(this.mouseYToScheduleTime(e.clientY) / 5) * 5;
        } else if (this.subjectCreationPlaceholder !== NaN) {
            this.subjectCreationPlaceholder = NaN;
        }
    },

    removeTemplate(templateId) {
        this.schedule.subjects = this.schedule.subjects.filter(subject => subject.template != templateId);
        this.templateFilter = null;

        const templateI = this.schedule.templates.findIndex(template => template.id == templateId);
        this.schedule.templates.splice(templateI, 1);
        this.markUnsaved();

        this.closeModal();
    },

    markHintDiscovered(hintId) {
        let hintIndex = this.showingHints.indexOf(hintId);
        if (hintIndex != -1) this.showingHints.splice(hintIndex, 1);

        if (!this.discoveredHints.includes(hintId)) {
            this.discoveredHints.push(hintId);
            localStorage.setItem("discoveredHints", JSON.stringify(this.discoveredHints));
        }
    },

    mounted() {
        const params = new URL(location.href).searchParams;

        if (params.get("schedule")) {
            this.schedule = JSON.parse(params.get("schedule"));
            this.isPreview = true;
        } else {
            const rawSchedule = localStorage.getItem("schedule");
            if (rawSchedule) {
                this.schedule = JSON.parse(rawSchedule);
            }
        }

        const rawHintsSeen = localStorage.getItem("discoveredHints");
        if (rawHintsSeen) {
            this.discoveredHints = JSON.parse(rawHintsSeen);
        }

        if (!this.discoveredHints.includes(0)) {
            setTimeout(() => {
                if (!this.discoveredHints.includes(0)) this.showingHints.push(0);
            }, 9000);
        }

        window.addEventListener("keydown", e => {
            if (e.key == "Escape") {
                this.closeModal();
            } else if (e.key == "Enter" && this.modalType == "input") {
                this.modal.done();
            } else if (e.key == "Delete" && this.modalType == "subject") {
                this.removeSubject(this.modal.id);
            } else if (e.ctrlKey && e.key == "s") {
                this.saveSchedule();
                e.preventDefault();
            }
        });

        window.addEventListener("beforeunload", e => {
            if (this.hasUnsavedChanges && !this.shouldSkipUnsavedMessage) {
                e.preventDefault();
                return (e.returnValue = "Du har osparade ändringar, vill du fortsätta?");
            }
        });

        const updateAllowConfigMenuToggling = () => {
            let hasWrapped = false;
            let lastTop = NaN;

            const configDivs = document.getElementsByClassName("config");
            for (let i = 0; i < configDivs.length; i++) {
                const boundingBox = configDivs[i].getBoundingClientRect();
                if (lastTop) {
                    if (boundingBox.top != lastTop) {
                        hasWrapped = true;
                        break;
                    }
                }

                lastTop = boundingBox.top;
            }

            this.allowConfigMenuToggling = hasWrapped;
        }
        window.addEventListener("resize", updateAllowConfigMenuToggling);
        requestAnimationFrame(updateAllowConfigMenuToggling);

        if (!this.schedule.version || this.schedule.version < VERSION) {
            console.warn("Old schedule version");
            this.warning = "Detta schema är gjort för en äldre version och vissa delar kan sluta fungera.";
        }

        this.loaded = true;
    }
}).mount();

